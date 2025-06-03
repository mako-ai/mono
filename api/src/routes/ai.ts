import { Hono } from "hono";
import OpenAI from "openai";
import { configLoader } from "../utils/config-loader";
import { mongoConnection } from "../utils/mongodb-connection";

export const aiRoutes = new Hono();

// Lazy-initialize OpenAI after env variables are guaranteed to be loaded
let openai: OpenAI | null = null;
const getOpenAI = (): OpenAI => {
  if (!openai) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY environment variable is not set");
    }
    openai = new OpenAI({ apiKey });
  }
  return openai;
};

// Tool definitions for OpenAI function calling
const chatTools: any[] = [
  {
    type: "function",
    name: "list_databases",
    description:
      "Return a list of all active MongoDB databases that the system knows about.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    type: "function",
    name: "list_collections",
    description:
      "Return a list of collections for the provided database identifier.",
    parameters: {
      type: "object",
      properties: {
        databaseId: {
          type: "string",
          description:
            "The id of the database to list collections for (e.g. server1.analytics_db)",
        },
      },
      required: ["databaseId"],
    },
  },
];

// --- Helper functions that implement the tools ----
const listDatabases = () => {
  console.log("DATA BASES LISTING");
  const mongoSources = configLoader.getMongoDBSources();
  return mongoSources.map((source) => ({
    id: source.id,
    name: source.name,
    description: source.description || "",
    database: source.database,
    active: source.active,
    serverId: source.serverId,
    serverName: source.serverName,
  }));
};

const listCollections = async (databaseId: string) => {
  const db = await mongoConnection.getDatabase(databaseId);
  const collections = await db
    .listCollections({ type: "collection" })
    .toArray();
  return collections.map((col: any) => ({
    name: col.name,
    type: col.type,
    options: col.options,
  }));
};

// Tool execution helper
const executeToolCall = async (fc: any) => {
  let parsedArgs: any = {};
  try {
    parsedArgs = fc.arguments ? JSON.parse(fc.arguments) : {};
  } catch (_) {}

  let result: any;
  try {
    switch (fc.name) {
      case "list_databases":
        result = listDatabases();
        break;
      case "list_collections":
        if (!parsedArgs.databaseId) {
          throw new Error("'databaseId' is required");
        }
        result = await listCollections(parsedArgs.databaseId);
        break;
      default:
        result = { error: `Unknown function: ${fc.name}` };
    }
  } catch (err: any) {
    result = { error: err.message || "Unknown error" };
  }

  return result;
};

// Streaming SSE endpoint - properly handling tool calls
aiRoutes.post("/chat/stream", async (c) => {
  try {
    const body = await c.req.json();
    const messages = body.messages as { role: string; content: string }[];
    if (!messages || !Array.isArray(messages)) {
      return c.json({ success: false, error: "Invalid messages array" }, 400);
    }

    const conversation = messages.map((m) => ({
      role: m.role,
      type: "message",
      content: m.content,
    }));

    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const encoder = new TextEncoder();

    // We'll collect all the data in memory and send it via SSE
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (data: any) => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
          );
        };

        try {
          let currentInput: any[] = conversation;
          let prevResponseId: string | undefined;

          while (true) {
            // Create a streaming response
            const responseStream = await getOpenAI().responses.create({
              model,
              input: currentInput,
              tools: chatTools,
              tool_choice: "auto",
              ...(prevResponseId
                ? { previous_response_id: prevResponseId }
                : {}),
              stream: true,
            });

            let responseId: string | undefined;
            const functionCalls: any[] = [];
            const functionCallData: Map<string, any> = new Map();
            let textAccumulator = "";
            let hasSentText = false;

            // Process the stream
            for await (const event of responseStream) {
              // Get response ID from response.completed event
              if (event.type === "response.completed") {
                responseId = event.response.id;
              }

              // Handle text deltas
              if (event.type === "response.output_text.delta" && event.delta) {
                textAccumulator += event.delta;
                sendEvent({ type: "text", content: event.delta });
                hasSentText = true;
              }

              // Collect function call start info
              if (
                event.type === "response.output_item.added" &&
                event.item?.type === "function_call" &&
                event.item.id
              ) {
                console.log("Function call added:", event.item);
                functionCallData.set(event.item.id, {
                  id: event.item.id,
                  name: event.item.name,
                  call_id: event.item.call_id || event.item.id, // Use call_id if available, fallback to id
                });
              }

              // Collect function call arguments
              if (event.type === "response.function_call_arguments.done") {
                console.log("Function call arguments done:", event);
                const callData = functionCallData.get(event.item_id);
                if (callData) {
                  functionCalls.push({
                    ...callData,
                    arguments: event.arguments,
                    call_id: callData.call_id,
                  });
                }
              }
            }

            // If there are no function calls, we're done
            if (functionCalls.length === 0) {
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
              break;
            }

            // If we have function calls, we need to execute them
            if (functionCalls.length > 0) {
              console.log("Function calls collected:", functionCalls);
              // Send tool execution notifications
              sendEvent({ type: "tool_call", message: "Executing tools..." });

              const toolOutputs: any[] = [];

              for (const fc of functionCalls) {
                sendEvent({
                  type: "tool_execution",
                  tool: fc.name,
                  call_id: fc.call_id,
                });

                const result = await executeToolCall(fc);

                toolOutputs.push({
                  type: "function_call_output",
                  call_id: fc.call_id,
                  output: JSON.stringify(result),
                });
              }

              console.log("Tool outputs being sent:", toolOutputs);
              sendEvent({ type: "tool_complete", message: "Continuing..." });

              // Set up the next iteration with tool outputs
              currentInput = toolOutputs;
              prevResponseId = responseId;
            }
          }
        } catch (error) {
          console.error("Streaming error:", error);
          sendEvent({ type: "error", message: "An error occurred" });
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error: any) {
    console.error("/api/ai/chat/stream error", error);
    return c.json(
      { success: false, error: error.message || "Unknown error" },
      500
    );
  }
});
