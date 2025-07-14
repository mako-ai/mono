import { Hono } from "hono";
import OpenAI from "openai";
import { mongoConnection } from "../utils/mongodb-connection";
import { QueryExecutor } from "../utils/query-executor";
import { ObjectId } from "mongodb";
import { Database } from "../database/workspace-schema";
import mongoose from "mongoose";

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

// Initialize QueryExecutor for query execution tool
const queryExecutor = new QueryExecutor();

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
            "The id of the database to list collections for (use database ID from web interface)",
        },
      },
      required: ["databaseId"],
    },
  },
  {
    type: "function",
    name: "execute_query",
    description:
      "Execute an arbitrary MongoDB query and return the results. The query should be written in JavaScript using MongoDB Node.js driver syntax (e.g., db.collection_name.find({}).limit(10)).",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "The MongoDB query to execute in JavaScript syntax. Use 'db' to reference the database and access collections (e.g., 'db.users.find({})', 'db.orders.aggregate([{$group: {_id: \"$status\", count: {$sum: 1}}}])')",
        },
        databaseId: {
          type: "string",
          description:
            "The database identifier to execute the query against (use database ID from web interface)",
        },
      },
      required: ["query", "databaseId"],
    },
  },
  {
    type: "function",
    name: "modify_console",
    description:
      "Modify the MongoDB query in the console editor. Use this to update, replace, or insert queries in the user's console.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["replace", "insert", "append"],
          description:
            "How to modify the console content. Use 'replace' to set the entire content, 'append' to add to the end, or 'insert' to add at a specific position.",
        },
        content: {
          type: "string",
          description: "The MongoDB query code to add to the console",
        },
        position: {
          type: "object",
          description:
            "Position for insert action (optional). If not provided for insert, will insert at cursor position.",
          properties: {
            line: { type: "number", description: "1-based line number" },
            column: { type: "number", description: "1-based column number" },
          },
          required: ["line", "column"],
          additionalProperties: false,
        },
      },
      required: ["action", "content"],
    },
  },
  {
    type: "function",
    name: "read_console",
    description:
      "Read the contents of the current console editor. Use this to examine the user's current query or code in the console.",
    parameters: {
      type: "object",
      properties: {
        consoleId: {
          type: "string",
          description:
            "Optional console ID to read from. If not provided, reads from the currently active console.",
        },
      },
      required: [],
    },
  },
];

// --- Helper functions that implement the tools ----
const listDatabases = async () => {
  console.log("DATA BASES LISTING");
  try {
    const databases = await Database.find({}).sort({ createdAt: -1 });
    return databases.map(db => ({
      id: db._id.toString(),
      name: db.name,
      description: "",
      database: db.connection.database,
      active: true,
      serverId: db._id.toString(),
      serverName: db.name,
    }));
  } catch (error) {
    console.error("Error fetching databases:", error);
    return [];
  }
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
const executeToolCall = async (fc: any, context?: { consoles?: any[] }) => {
  let parsedArgs: any = {};
  try {
    parsedArgs = fc.arguments ? JSON.parse(fc.arguments) : {};
  } catch (e) {
    console.error("Failed to parse arguments", fc.arguments, e);
  }

  let result: any;
  try {
    switch (fc.name) {
      case "list_databases":
        result = await listDatabases();
        break;
      case "list_collections":
        if (!parsedArgs.databaseId) {
          throw new Error("'databaseId' is required");
        }
        result = await listCollections(parsedArgs.databaseId);
        break;
      case "execute_query":
        if (!parsedArgs.query) {
          throw new Error("'query' is required");
        }
        if (!parsedArgs.databaseId) {
          throw new Error("'databaseId' is required");
        }
        result = await queryExecutor.executeQuery(
          parsedArgs.query,
          parsedArgs.databaseId,
        );
        console.log("PARSED ARGS", parsedArgs);
        console.log("RESULT", result);
        break;
      case "modify_console":
        if (!parsedArgs.action) {
          throw new Error("'action' is required");
        }
        if (!parsedArgs.content) {
          throw new Error("'content' is required");
        }
        // Just return the modification parameters - the actual console modification
        // will be handled on the frontend via SSE events
        result = {
          success: true,
          modification: {
            action: parsedArgs.action,
            content: parsedArgs.content,
            position: parsedArgs.position,
          },
        };
        break;
      case "read_console": {
        // Read console content from the context provided by frontend
        const consoleId = parsedArgs.consoleId;
        const consoles = context?.consoles || [];

        if (consoleId) {
          // Find specific console by ID
          const console = consoles.find((c: any) => c.id === consoleId);
          if (console) {
            result = {
              success: true,
              consoleId: console.id,
              title: console.title,
              content: console.content || "",
              metadata: console.metadata || {},
            };
          } else {
            result = {
              success: false,
              error: `Console with ID ${consoleId} not found`,
            };
          }
        } else {
          // Return the active console (first one in the array)
          if (consoles.length > 0) {
            const activeConsole = consoles[0];
            result = {
              success: true,
              consoleId: activeConsole.id,
              title: activeConsole.title,
              content: activeConsole.content || "",
              metadata: activeConsole.metadata || {},
            };
          } else {
            result = {
              success: false,
              error: "No console is currently active",
            };
          }
        }
        break;
      }
      default:
        result = { error: `Unknown function: ${fc.name}` };
    }
  } catch (err: any) {
    result = { error: err.message || "Unknown error" };
  }

  return result;
};

// Helper to update chat session with new messages
const updateChatSession = async (
  sessionId: string,
  messages: { role: string; content: string }[],
) => {
  try {
    const db = mongoose.connection.db;
    if (!db) {
      throw new Error("Database connection not established");
    }
    await db.collection("chats").updateOne(
      { _id: new ObjectId(sessionId) },
      {
        $set: { messages, updatedAt: new Date() },
      },
      { upsert: false },
    );
  } catch (err) {
    console.error("Failed to update chat session", err);
  }
};

// NEW: Persist the full OpenAI invocation (request + response + tools) for auditing/debugging
const logChatInvocation = async (params: {
  sessionId?: string;
  openaiRequest: any;
  openaiResponseEvents: any[];
  functionCalls: any[];
  toolOutputs: any[];
}) => {
  try {
    const db = mongoose.connection.db;
    if (!db) {
      throw new Error("Database connection not established");
    }
    await db.collection("chat_logs").insertOne({
      chatId: params.sessionId ? params.sessionId : null,
      timestamp: new Date(),
      openaiRequest: params.openaiRequest,
      openaiResponseEvents: params.openaiResponseEvents,
      functionCalls: params.functionCalls,
      toolOutputs: params.toolOutputs,
    });
  } catch (err) {
    console.error("Failed to persist chat invocation", err);
  }
};

// Streaming SSE endpoint - properly handling tool calls
aiRoutes.post("/chat/stream", async c => {
  try {
    const body = await c.req.json();

    console.log("/chat/stream body", JSON.stringify(body, null, 2));

    const sessionId = body.sessionId as string | undefined;
    const consoles = body.consoles as any[] | undefined; // Extract consoles from request

    // 1. Build the base messages array (existing chat history if any)
    let messages: { role: string; content: string }[] = [];

    if (Array.isArray(body.messages)) {
      // Legacy behaviour: caller sends the entire history
      messages = body.messages;
    } else if (sessionId) {
      // Fetch existing history from DB
      try {
        const db = mongoose.connection.db;
        if (!db) {
          throw new Error("Database connection not established");
        }
        const chat = await db
          .collection("chats")
          .findOne({ _id: new ObjectId(sessionId) });
        if (chat && Array.isArray(chat.messages)) {
          messages = chat.messages as any[];
        }
      } catch (err) {
        console.error("Failed to fetch chat history", err);
      }
    }

    // 2. Append the latest user message (preferred new contract: body.message)
    if (typeof body.message === "string" && body.message.trim().length > 0) {
      messages = [...messages, { role: "user", content: body.message.trim() }];
    }

    if (!messages || messages.length === 0) {
      return c.json(
        {
          success: false,
          error: "No messages provided and no existing chat history found.",
        },
        400,
      );
    }

    // Add system prompt to guide the agent on using the modify_console tool
    const systemPrompt = `You are a MongoDB query assistant with direct access to the user's query console. 

When users ask you to:
- "Write a query" → Use 'replace' action to set the entire console content
- "Add to my query" → Use 'append' action to add to existing content  
- "Fix my query" → Use 'replace' with the corrected version
- "Insert at line X" → Use 'insert' action with position

When users mention their console or current query:
- Use 'read_console' to examine the current console content first
- This helps you understand what the user is working on
- You can then provide targeted help or modifications

If a user says something like "fix my query", "what's wrong with my query", or references "the console":
1. First use 'read_console' to see what they're working on
2. Then provide help or use 'modify_console' to make corrections

Always explain what the query does after modifying the console. Be concise but helpful.`;

    const conversation = [
      { role: "system", type: "message", content: systemPrompt },
      ...messages.map(m => ({
        role: m.role,
        type: "message",
        content: m.content,
      })),
    ];

    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const encoder = new TextEncoder();

    // We'll collect all the data in memory and send it via SSE
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (data: any) => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
          );
        };

        try {
          let currentInput: any[] = conversation;
          let prevResponseId: string | undefined;
          let latestAssistantMessage = "";

          // eslint-disable-next-line no-constant-condition
          while (true) {
            // Create a streaming response
            const openaiRequestPayload: any = {
              model,
              input: currentInput,
              tools: chatTools,
              tool_choice: "auto",
              ...(prevResponseId
                ? { previous_response_id: prevResponseId }
                : {}),
            };

            console.log(JSON.stringify(openaiRequestPayload, null, 2));

            const responseStream: AsyncIterable<any> =
              (await getOpenAI().responses.create({
                ...openaiRequestPayload,
                stream: true,
              } as any)) as any;

            let responseId: string | undefined;
            const functionCalls: any[] = [];
            const functionCallData: Map<string, any> = new Map();
            let textAccumulator = "";

            // Process the stream
            const openaiEvents: any[] = []; // Collect every event for full auditing
            for await (const event of responseStream) {
              openaiEvents.push(event);
              // Get response ID from response.completed event
              if (event.type === "response.completed") {
                responseId = event.response.id;
              }

              // Handle text deltas
              if (event.type === "response.output_text.delta" && event.delta) {
                textAccumulator += event.delta;
                sendEvent({ type: "text", content: event.delta });
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

            // Persist the entire invocation data (request, response, tools) before any further processing
            await logChatInvocation({
              sessionId,
              openaiRequest: openaiRequestPayload,
              openaiResponseEvents: openaiEvents,
              functionCalls,
              toolOutputs: [], // Will be populated later if tools execute
            });

            // If there are no function calls, we're done
            if (functionCalls.length === 0) {
              latestAssistantMessage = textAccumulator;
              // Persist chat session if sessionId provided
              if (sessionId) {
                await updateChatSession(sessionId, [
                  ...messages,
                  { role: "assistant", content: latestAssistantMessage },
                ]);
              }

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

                const result = await executeToolCall(fc, { consoles });

                // Send special event for console modifications
                if (fc.name === "modify_console" && result.success) {
                  sendEvent({
                    type: "console_modification",
                    modification: result.modification,
                  });
                }

                toolOutputs.push({
                  type: "function_call_output",
                  call_id: fc.call_id,
                  output: JSON.stringify(result),
                });
              }

              // Persist tool outputs along with the previously stored invocation record
              await logChatInvocation({
                sessionId,
                openaiRequest: openaiRequestPayload,
                openaiResponseEvents: openaiEvents,
                functionCalls,
                toolOutputs,
              });

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
      500,
    );
  }
});
