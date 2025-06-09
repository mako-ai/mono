import { Hono } from "hono";
// @ts-ignore – module will be provided via dependency at runtime
import { Agent, run as runAgent, tool } from "@openai/agents";
import { configLoader } from "../utils/config-loader";
import { mongoConnection } from "../utils/mongodb-connection";
import { QueryExecutor } from "../utils/query-executor";
import { ObjectId, Decimal128 } from "mongodb";
import {
  shouldGenerateTitle,
  generateChatTitle,
} from "../services/title-generator";
import { Chat, Workspace } from "../database/workspace-schema";

// Create a router that will be mounted at /api/agent
export const agentRoutes = new Hono();

// ------------------------------------------------------------------------------------
// Helper functions & shared instances
// ------------------------------------------------------------------------------------

// Expose the same helper utilities we already use for the responses chat route so the
// new Agent can re-use them.
const queryExecutor = new QueryExecutor();

// Helper to get the default workspace (first one by creation date)
const getDefaultWorkspace = async () => {
  return await Workspace.findOne().sort({ createdAt: 1 });
};

// ------------------------------------------------------------------------------------
// Database/Collection helpers
// ------------------------------------------------------------------------------------

const listDatabases = () => {
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

// Infer a simple BSON type string for a given value
const inferBsonType = (value: any): string => {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (value instanceof ObjectId) return "objectId";
  if (value instanceof Date) return "date";
  if (value instanceof Decimal128) return "decimal";
  if (typeof value === "object") return "object";
  return typeof value; // string, number, boolean, undefined, etc.
};

/**
 * Sample a subset of documents from the collection and build a lightweight
 * schema summary of field names and their observed BSON types.
 *
 * Returns an object containing:
 *   - schema: Array<{ field: string; types: string[] }>
 *   - sampleDocuments: the sampled documents used for the inspection
 *   - totalSampled: number of sampled documents (may be < SAMPLE_SIZE if the
 *                   collection is small)
 */
const inspectCollection = async (
  databaseId: string,
  collectionName: string
) => {
  const db = await mongoConnection.getDatabase(databaseId);
  const collection = db.collection(collectionName);

  const SAMPLE_SIZE = 100;

  // Use aggregation with $sample to quickly get a representative subset
  const sampleDocuments = await collection
    .aggregate([{ $sample: { size: SAMPLE_SIZE } }])
    .toArray();

  // Build schema summary
  const fieldTypeMap: Record<string, Set<string>> = {};

  for (const doc of sampleDocuments) {
    for (const [field, value] of Object.entries(doc)) {
      if (!fieldTypeMap[field]) fieldTypeMap[field] = new Set<string>();
      fieldTypeMap[field].add(inferBsonType(value));
    }
  }

  const schema = Object.entries(fieldTypeMap).map(([field, types]) => ({
    field,
    types: Array.from(types),
  }));

  return {
    schema,
    sampleDocuments: sampleDocuments.slice(0, 25),
    totalSampled: sampleDocuments.length,
  };
};

// ------------------------------------------------------------------------------------
// Tool wrappers – these are exported to the OpenAI Agents SDK so that the model can
// decide when to call them.
// ------------------------------------------------------------------------------------

// IMPORTANT: The Agents SDK will automatically infer the JSON schema from the
//             `parameters` object. This keeps us roughly consistent with the function
//             calling definitions used elsewhere in the code-base.

const listDatabasesTool = tool({
  name: "list_databases",
  description:
    "Return a list of all active MongoDB databases that the system knows about.",
  parameters: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
  execute: async (_: any) => listDatabases(),
});

const listCollectionsTool = tool({
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
    additionalProperties: false,
  },
  execute: async (input: any) => listCollections(input.databaseId),
});

const executeQueryTool = tool({
  name: "execute_query",
  description:
    "Execute an arbitrary MongoDB query and return the results. The query should be written in JavaScript using MongoDB Node.js driver syntax.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "The MongoDB query to execute in JavaScript syntax (e.g., 'db.users.find({})').",
      },
      databaseId: {
        type: "string",
        description:
          "The database identifier to execute the query against (e.g. server1.analytics_db)",
      },
    },
    required: ["query", "databaseId"],
    additionalProperties: false,
  },
  execute: async (input: any) =>
    queryExecutor.executeQuery(input.query, input.databaseId),
});

const inspectCollectionTool = tool({
  name: "inspect_collection",
  description:
    "Sample documents from a collection to infer field names and BSON data types. Returns the sample set and a schema summary.",
  parameters: {
    type: "object",
    properties: {
      databaseId: {
        type: "string",
        description:
          "The database identifier to inspect (e.g. server1.analytics_db)",
      },
      collectionName: {
        type: "string",
        description: "The name of the collection to inspect (e.g. users)",
      },
    },
    required: ["databaseId", "collectionName"],
    additionalProperties: false,
  },
  execute: async (input: any) =>
    inspectCollection(input.databaseId, input.collectionName),
});

// ------------------------------------------------------------------------------------
// The Agent definition
// ------------------------------------------------------------------------------------

const dbAgent = new Agent({
  name: "Database Assistant",
  instructions: `You are an expert MongoDB assistant.
  Your goal is to help the user write MongoDB queries (mostly aggregation) to answer their questions.
  Use the available tools to inspect the available databases, list their collections, inspect collections schemas and execute queries.
  Your process should be:
  1. Decide which database to use (only one!)
  2. Decide which collections to use (one or several)
  3. Inspect the collections to understand the schema
  4. Write a MongoDB query to answer the question
  5. Test the query by executing it and reading results
  6. Send the query back to the user in the chat.
  If you aren't sure, ask clarifying questions before proceeding.

  Always send the full query back to the user, but always test it yourself first.
  Always add a comment at the top of the query with the database to be used
  When responding, prefer concise, clear explanations.
  The available tools are:
    - list_databases: List all active MongoDB databases that the system knows about.
    - list_collections: List all collections for the provided database identifier.
    - execute_query: Execute an arbitrary MongoDB query and return the results. The query should be written in JavaScript using MongoDB Node.js driver syntax.
    - inspect_collection: Sample documents from a collection to infer field names and BSON data types. Returns the sample set and a schema summary.

    | Requirement                      | Do ✓                                                                                                    | Don't ✗                                          |
    | -------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
    | **Pivot all period-based data**  | Return **one document per entity**, with each period as a **field name** (\`"2025-01"\`, \`"2025-02"\`, …). | Never send separate docs per month/quarter/year. |
    | **Flat, table-friendly objects** | Use clear identifier fields (\`product\`, \`closer\`, …).                                                   | Avoid nested arrays/objects for final output.    |
    | **Column order**                 | Use \`$replaceRoot\` to build the final object so keys stay in logical order.                             | Don't rely on \`$project\` for re-shaping.         |
    | **Missing periods**              | Fill with \`0\` or \`null\`.                                                                                | Leave gaps.                                      |
    | **Fields with dots**             | Access via \`$getField\`.                                                                                 | Dot-notation on such fields.                     |

    `,
  tools: [
    listDatabasesTool,
    listCollectionsTool,
    inspectCollectionTool,
    executeQueryTool,
  ],
  model: "o3",
});

// ------------------------------------------------------------------------------------
// Chat-session helpers (shared with the /ai route but duplicated locally to avoid a
// circular dependency).
// ------------------------------------------------------------------------------------

const persistChatSession = async (sessionId: string, messages: any[]) => {
  await Chat.findByIdAndUpdate(
    sessionId,
    { messages, updatedAt: new Date() },
    { new: true }
  );
};

// ------------------------------------------------------------------------------------
// POST /   (mounted at /api/agent) – Run the agent once and return the assistant reply
// ------------------------------------------------------------------------------------
// Debug version - Add this temporarily to see what events are coming through
agentRoutes.post("/stream", async (c) => {
  let body: any = {};
  try {
    body = await c.req.json();
  } catch (_) {}

  const { message, sessionId, workspaceId } = body as {
    message?: string;
    sessionId?: string;
    workspaceId?: string;
  };

  if (!message || typeof message !== "string" || message.trim().length === 0) {
    return c.json({ error: "'message' is required" }, 400);
  }

  if (!workspaceId || !ObjectId.isValid(workspaceId)) {
    return c.json(
      { error: "'workspaceId' is required and must be valid" },
      400
    );
  }

  // Load existing messages...
  let existingMessages: { role: "user" | "assistant"; content: string }[] = [];
  let existingChat: any = null;

  if (sessionId) {
    try {
      existingChat = await Chat.findOne({
        _id: new ObjectId(sessionId),
        workspaceId: new ObjectId(workspaceId),
      });
      if (existingChat && Array.isArray(existingChat.messages)) {
        existingMessages = existingChat.messages as any[];
      }
    } catch (_) {}
  }

  const conversationLines: string[] = existingMessages.map(
    (m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`
  );
  conversationLines.push(`User: ${message.trim()}`);
  const agentInput = conversationLines.join("\n\n");

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const runStream: any = await runAgent(dbAgent, agentInput, {
          stream: true,
        });

        let assistantReply = "";
        let eventCount = 0;
        let textDeltaCount = 0;

        // Debug: Log first 10 events to understand structure
        for await (const event of runStream as AsyncIterable<any>) {
          eventCount++;

          // Debug logging for first 20 events
          if (eventCount <= 20) {
            console.log(`Event #${eventCount}:`, {
              type: event?.type,
              dataType: event?.data?.type,
              hasData: !!event?.data,
              hasDelta: !!event?.data?.delta,
              deltaType: typeof event?.data?.delta,
              // Log a sample of the delta if it exists
              deltaSample: event?.data?.delta
                ? typeof event?.data?.delta === "string"
                  ? event?.data?.delta.substring(0, 50)
                  : "non-string"
                : "no-delta",
            });
          }

          // Check all possible text delta patterns
          if (event?.type === "raw_model_stream_event") {
            const data = event.data;

            // Try different field names that might contain text
            let textDelta = null;
            if (data?.type === "output_text_delta") {
              textDelta = data.delta;
            } else if (data?.type === "response.output_text.delta") {
              textDelta = data.delta;
            } else if (data?.type === "text_delta") {
              textDelta = data.delta;
            } else if (data?.type === "content.delta") {
              textDelta = data.text || data.delta;
            }

            if (textDelta && typeof textDelta === "string") {
              textDeltaCount++;
              assistantReply += textDelta;
              sendEvent({ type: "text", content: textDelta });
            }
          }

          // Process other events as before...
          if (event?.type === "run_item_stream_event") {
            const itemEvent = event;
            const item = itemEvent.item;

            // Tool call started - debug the structure
            if (
              item?.type === "tool_call_item" &&
              itemEvent.name === "tool_called"
            ) {
              console.log("Tool call item full structure:", {
                itemType: item.type,
                hasRawItem: !!item.rawItem,
                rawItemType: item.rawItem?.type,
                rawItemFunction: item.rawItem?.function,
                rawItemFunctionName: item.rawItem?.function?.name,
                rawItemName: item.rawItem?.name,
                agentName: item.agent?.name,
              });

              // The tool name is in rawItem.function.name
              const toolName =
                item.rawItem?.function?.name ||
                item.rawItem?.name ||
                "unknown_tool";

              sendEvent({
                type: "step",
                name: `tool_called:${toolName}`,
                status: "started",
              });
            }

            // Tool call completed
            if (
              item?.type === "tool_call_output_item" &&
              itemEvent.name === "output_added"
            ) {
              // For output items, we need to track which tool was called
              // This might require correlating with the tool_call_id
              const toolName =
                item.rawItem?.function?.name ||
                item.rawItem?.name ||
                item.tool_call_name ||
                "completed_tool";

              sendEvent({
                type: "step",
                name: `tool_output:${toolName}`,
                status: "completed",
              });
            }

            if (itemEvent.name === "message_output_created") {
              sendEvent({
                type: "step",
                name: "message_generation",
                status: "started",
              });
            }
          }
        }

        console.log(
          `Total events processed: ${eventCount}, Text deltas found: ${textDeltaCount}`
        );

        // Wait for completion
        await runStream.completed;

        if (!assistantReply && runStream.finalOutput) {
          console.log("No streamed text, using finalOutput");
          assistantReply = runStream.finalOutput;
          sendEvent({ type: "text", content: assistantReply });
        }

        // Persist messages with smart title generation...
        const updatedMessages = [
          ...existingMessages,
          { role: "user", content: message.trim() },
          { role: "assistant", content: assistantReply },
        ];

        let finalSessionId = sessionId;
        const now = new Date();

        if (!sessionId) {
          // New conversation - start with a temporary title
          const newChat = new Chat({
            workspaceId: new ObjectId(workspaceId),
            title: "New Chat", // Temporary title
            messages: updatedMessages,
            createdBy: "system", // TODO: Get from auth context when available
            titleGenerated: false, // Flag to track if we've generated a proper title
            createdAt: now,
            updatedAt: now,
          });

          await newChat.save();
          finalSessionId = newChat._id.toString();

          // Generate title asynchronously without blocking the response
          if (shouldGenerateTitle(updatedMessages)) {
            // Fire-and-forget title generation
            generateChatTitle(updatedMessages)
              .then((generatedTitle) => {
                return Chat.findByIdAndUpdate(finalSessionId, {
                  title: generatedTitle,
                  titleGenerated: true,
                  updatedAt: new Date(),
                });
              })
              .then(() => {
                console.log(
                  `Generated title for new chat: "${finalSessionId}"`
                );
              })
              .catch((error) => {
                console.error("Failed to generate title for new chat:", error);
              });
          }
        } else {
          // Existing conversation - update messages
          await persistChatSession(sessionId, updatedMessages);

          // Generate title asynchronously for existing chats without blocking
          if (
            existingChat &&
            !existingChat.titleGenerated &&
            shouldGenerateTitle(updatedMessages)
          ) {
            // Fire-and-forget title generation
            generateChatTitle(updatedMessages)
              .then((generatedTitle) => {
                return Chat.findByIdAndUpdate(sessionId, {
                  title: generatedTitle,
                  titleGenerated: true,
                  updatedAt: new Date(),
                });
              })
              .then(() => {
                console.log(
                  `Generated title for existing chat: "${sessionId}"`
                );
              })
              .catch((error) => {
                console.error(
                  "Failed to generate title for existing chat:",
                  error
                );
              });
          }
        }

        sendEvent({ type: "session", sessionId: finalSessionId });
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (err: any) {
        console.error("/api/agent/stream error", err);
        sendEvent({
          type: "error",
          message: err.message || "Unexpected error",
        });
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
});
