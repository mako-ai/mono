import { Hono } from "hono";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore – module will be provided via dependency at runtime
import { Agent, run as runAgent, tool } from "@openai/agents";
import { ObjectId, Decimal128 } from "mongodb";
import { v4 as uuidv4 } from "uuid";
import {
  shouldGenerateTitle,
  generateChatTitle,
} from "../services/title-generator";
import { Chat, Database } from "../database/workspace-schema";
import { databaseConnectionService } from "../services/database-connection.service";
import { Types } from "mongoose";

// Create a router that will be mounted at /api/agent
export const agentRoutes = new Hono();

// ------------------------------------------------------------------------------------
// Thread Management Configuration
// ------------------------------------------------------------------------------------

const CONTEXT_WINDOW_SIZE = 10; // Number of recent messages to include
const MAX_CONTEXT_LENGTH = 4000; // Maximum characters for context

interface ThreadContext {
  threadId: string;
  recentMessages: Array<{ role: "user" | "assistant"; content: string }>;
  metadata: {
    messageCount: number;
    lastActivityAt: Date;
  };
}

// ------------------------------------------------------------------------------------
// Thread Management Functions
// ------------------------------------------------------------------------------------

/**
 * Get or create a thread context for efficient conversation management
 */
const getOrCreateThreadContext = async (
  sessionId: string | undefined,
  workspaceId: string,
): Promise<ThreadContext> => {
  if (sessionId) {
    const existingChat = await Chat.findOne({
      _id: new ObjectId(sessionId),
      workspaceId: new ObjectId(workspaceId),
    });

    if (existingChat) {
      // Get recent messages based on window size
      const messages = existingChat.messages || [];
      const recentMessages = messages.slice(-CONTEXT_WINDOW_SIZE);

      // If chat doesn't have a threadId, create one and update the document
      let threadId = existingChat.threadId;
      if (!threadId) {
        threadId = uuidv4();
        // Update the chat with the new threadId
        await Chat.findByIdAndUpdate(sessionId, { threadId });
        console.log(
          `Created threadId ${threadId} for existing chat ${sessionId}`,
        );
      }

      return {
        threadId,
        recentMessages,
        metadata: {
          messageCount: messages.length,
          lastActivityAt: existingChat.updatedAt,
        },
      };
    }
  }

  // Create new thread
  return {
    threadId: uuidv4(),
    recentMessages: [],
    metadata: {
      messageCount: 0,
      lastActivityAt: new Date(),
    },
  };
};

/**
 * Build optimized context for the agent
 */
const buildAgentContext = (
  threadContext: ThreadContext,
  newMessage: string,
): string => {
  const contextParts: string[] = [];

  // Add note about conversation history for long conversations
  if (threadContext.metadata.messageCount > CONTEXT_WINDOW_SIZE) {
    contextParts.push(
      `[Previous ${threadContext.metadata.messageCount - CONTEXT_WINDOW_SIZE} messages omitted]\n`,
    );
  }

  // Add recent messages
  if (threadContext.recentMessages.length > 0) {
    contextParts.push("Recent conversation:");
    for (const msg of threadContext.recentMessages) {
      const speaker = msg.role === "user" ? "User" : "Assistant";
      contextParts.push(`${speaker}: ${msg.content}`);
    }
    contextParts.push(""); // Empty line for separation
  }

  // Add current message
  contextParts.push(`User: ${newMessage}`);

  const fullContext = contextParts.join("\n");

  // Truncate if too long (simple truncation, could be improved with smarter summarization)
  if (fullContext.length > MAX_CONTEXT_LENGTH) {
    const truncatedContext = fullContext.substring(
      fullContext.length - MAX_CONTEXT_LENGTH,
    );
    return `[Context truncated]\n...${truncatedContext}`;
  }

  return fullContext;
};

// ------------------------------------------------------------------------------------
// Database/Collection helpers (same as before)
// ------------------------------------------------------------------------------------

const listDatabases = async (workspaceId: string) => {
  if (!Types.ObjectId.isValid(workspaceId)) {
    throw new Error("Invalid workspace ID");
  }

  const databases = await Database.find({
    workspaceId: new Types.ObjectId(workspaceId),
  }).sort({ name: 1 });

  return databases.map(db => ({
    id: db._id.toString(),
    name: db.name,
    description: "",
    database: db.connection.database,
    type: db.type,
    active: true,
    displayName: db.connection.database || db.name || "Unknown Database",
  }));
};

const listCollections = async (databaseId: string, workspaceId: string) => {
  if (
    !Types.ObjectId.isValid(databaseId) ||
    !Types.ObjectId.isValid(workspaceId)
  ) {
    throw new Error("Invalid database ID or workspace ID");
  }

  const database = await Database.findOne({
    _id: new Types.ObjectId(databaseId),
    workspaceId: new Types.ObjectId(workspaceId),
  });

  if (!database) {
    throw new Error("Database not found or access denied");
  }

  if (database.type !== "mongodb") {
    throw new Error("Collection listing only supported for MongoDB databases");
  }

  const connection = await databaseConnectionService.getConnection(database);
  const db = connection.db(database.connection.database);
  const collections = await db
    .listCollections({ type: "collection" })
    .toArray();

  return collections.map((col: any) => ({
    name: col.name,
    type: col.type,
    options: col.options,
  }));
};

const inferBsonType = (value: any): string => {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (value instanceof ObjectId) return "objectId";
  if (value instanceof Date) return "date";
  if (value instanceof Decimal128) return "decimal";
  if (typeof value === "object") return "object";
  return typeof value;
};

const inspectCollection = async (
  databaseId: string,
  collectionName: string,
  workspaceId: string,
) => {
  if (
    !Types.ObjectId.isValid(databaseId) ||
    !Types.ObjectId.isValid(workspaceId)
  ) {
    throw new Error("Invalid database ID or workspace ID");
  }

  const database = await Database.findOne({
    _id: new Types.ObjectId(databaseId),
    workspaceId: new Types.ObjectId(workspaceId),
  });

  if (!database) {
    throw new Error("Database not found or access denied");
  }

  if (database.type !== "mongodb") {
    throw new Error(
      "Collection inspection only supported for MongoDB databases",
    );
  }

  const connection = await databaseConnectionService.getConnection(database);
  const db = connection.db(database.connection.database);
  const collection = db.collection(collectionName);

  const SAMPLE_SIZE = 100;

  const sampleDocuments = await collection
    .aggregate([{ $sample: { size: SAMPLE_SIZE } }])
    .toArray();

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

const executeQuery = async (
  query: string,
  databaseId: string,
  workspaceId: string,
) => {
  if (
    !Types.ObjectId.isValid(databaseId) ||
    !Types.ObjectId.isValid(workspaceId)
  ) {
    throw new Error("Invalid database ID or workspace ID");
  }

  const database = await Database.findOne({
    _id: new Types.ObjectId(databaseId),
    workspaceId: new Types.ObjectId(workspaceId),
  });

  if (!database) {
    throw new Error("Database not found or access denied");
  }

  const result = await databaseConnectionService.executeQuery(database, query);

  return result;
};

// ------------------------------------------------------------------------------------
// Tool wrappers (same as before)
// ------------------------------------------------------------------------------------

const createWorkspaceTools = (
  workspaceId: string,
  sendEvent?: (data: any) => void,
  consoles?: any[],
) => {
  const listDatabasesTool = tool({
    name: "list_databases",
    description:
      "Return a list of all active MongoDB databases that the system knows about for the current workspace.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    execute: async (_: any) => listDatabases(workspaceId),
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
            "The id of the database to list collections for (e.g. 68470cf77091aab932a69c81)",
        },
      },
      required: ["databaseId"],
      additionalProperties: false,
    },
    execute: async (input: any) =>
      listCollections(input.databaseId, workspaceId),
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
            "The database identifier to execute the query against (e.g. 68470cf77091aab932a69c81)",
        },
      },
      required: ["query", "databaseId"],
      additionalProperties: false,
    },
    execute: async (input: any) =>
      executeQuery(input.query, input.databaseId, workspaceId),
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
            "The database identifier to inspect (e.g. 68470cf77091aab932a69c81)",
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
      inspectCollection(input.databaseId, input.collectionName, workspaceId),
  });

  const modifyConsoleTool = tool({
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
            "How to modify the console content. Use 'replace' to set the entire content, 'append' to add to the end, or 'insert' to add at cursor position.",
        },
        content: {
          type: "string",
          description: "The MongoDB query code to add to the console",
        },
      },
      required: ["action", "content"],
      additionalProperties: false,
    },
    execute: async (input: any) => {
      const modification = {
        action: input.action,
        content: input.content,
        position: input.position,
      };

      if (sendEvent) {
        console.log(
          "Sending console_modification event from tool:",
          modification,
        );
        sendEvent({
          type: "console_modification",
          modification: modification,
        });
      }

      return {
        success: true,
        modification: modification,
        message: `✓ Console ${input.action}d successfully`,
      };
    },
  });

  const readConsoleTool = tool({
    name: "read_console",
    description:
      "Read the contents of the current console editor. Use this to examine the user's current query or code in the console. By default, reads from the currently active console.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    execute: async (input: any) => {
      const consolesData = consoles || [];
      const consoleId = input.consoleId;

      if (consoleId) {
        const console = consolesData.find((c: any) => c.id === consoleId);
        if (console) {
          return {
            success: true,
            consoleId: console.id,
            title: console.title,
            content: console.content || "",
            metadata: console.metadata || {},
          };
        } else {
          return {
            success: false,
            error: `Console with ID ${consoleId} not found`,
          };
        }
      } else {
        if (consolesData.length > 0) {
          const activeConsole = consolesData[0];
          return {
            success: true,
            consoleId: activeConsole.id,
            title: activeConsole.title,
            content: activeConsole.content || "",
            metadata: activeConsole.metadata || {},
          };
        } else {
          return {
            success: false,
            error: "No console is currently active",
          };
        }
      }
    },
  });

  return [
    listDatabasesTool,
    listCollectionsTool,
    inspectCollectionTool,
    executeQueryTool,
    modifyConsoleTool,
    readConsoleTool,
  ];
};

// ------------------------------------------------------------------------------------
// Agent definition with thread awareness
// ------------------------------------------------------------------------------------

const createDbAgent = (
  workspaceId: string,
  sendEvent?: (data: any) => void,
  consoles?: any[],
) =>
  new Agent({
    name: "Database Assistant",
    instructions: `You are a helpful database assistant with direct access to the user's MongoDB databases and query console.

**Important:** If a user refers to "my query", "the console", or asks to "fix my query", ALWAYS use the read_console tool first to see what they're working on.

## Your Capabilities:
1. List and explore databases and collections
2. Execute MongoDB queries using JavaScript driver syntax
3. Analyze collection schemas and document structures  
4. Read and modify the user's console editor
5. Help debug and optimize queries

## Query Syntax:
Always use proper MongoDB JavaScript driver syntax:
- db.collection.find({})
- db.collection.aggregate([...])
- db.collection.findOne({})
- etc.

## When Users Ask About Their Console:
1. Use read_console to see what they're working on
2. The active console is always available, even if not explicitly mentioned
3. Provide targeted help based on the actual content
4. Use modify_console to make corrections if needed

Be concise but helpful. Explain what queries do and suggest improvements when appropriate.

The available tools are:
  - list_databases: List all active MongoDB databases that the system knows about.
  - list_collections: List all collections for the provided database identifier.
  - execute_query: Execute an arbitrary MongoDB query and return the results.
  - inspect_collection: Sample documents from a collection to infer field names and BSON data types.
  - modify_console: Modify the MongoDB query in the console editor.
  - read_console: Read the contents of the current console editor (always has access to the active console).`,
    tools: createWorkspaceTools(workspaceId, sendEvent, consoles),
    model: "o3",
  });

// ------------------------------------------------------------------------------------
// Enhanced chat persistence with thread management
// ------------------------------------------------------------------------------------

const persistChatSession = async (
  sessionId: string | undefined,
  threadContext: ThreadContext,
  updatedMessages: any[],
  workspaceId: string,
): Promise<string> => {
  const now = new Date();

  if (!sessionId) {
    // New conversation
    const newChat = new Chat({
      workspaceId: new ObjectId(workspaceId),
      threadId: threadContext.threadId,
      title: "New Chat",
      messages: updatedMessages,
      createdBy: "system", // TODO: Get from auth context
      titleGenerated: false,
      createdAt: now,
      updatedAt: now,
    });

    await newChat.save();
    const newSessionId = newChat._id.toString();

    // Generate title asynchronously
    if (shouldGenerateTitle(updatedMessages)) {
      generateChatTitle(updatedMessages)
        .then(generatedTitle => {
          return Chat.findByIdAndUpdate(newSessionId, {
            title: generatedTitle,
            titleGenerated: true,
            updatedAt: new Date(),
          });
        })
        .catch(error => {
          console.error("Failed to generate title for new chat:", error);
        });
    }

    return newSessionId;
  } else {
    // Update existing conversation
    const updateData: any = {
      messages: updatedMessages,
      updatedAt: now,
    };

    // Update threadId if it wasn't set before
    if (!threadContext.threadId) {
      updateData.threadId = uuidv4();
    }

    const existingChat = await Chat.findByIdAndUpdate(sessionId, updateData, {
      new: true,
    });

    // Generate title if needed
    if (
      existingChat &&
      !existingChat.titleGenerated &&
      shouldGenerateTitle(updatedMessages)
    ) {
      generateChatTitle(updatedMessages)
        .then(generatedTitle => {
          return Chat.findByIdAndUpdate(sessionId, {
            title: generatedTitle,
            titleGenerated: true,
            updatedAt: new Date(),
          });
        })
        .catch(error => {
          console.error("Failed to generate title for existing chat:", error);
        });
    }

    return sessionId;
  }
};

// ------------------------------------------------------------------------------------
// POST /stream - Threaded version with optimized context management
// ------------------------------------------------------------------------------------

agentRoutes.post("/stream", async c => {
  let body: any = {};
  try {
    body = await c.req.json();
  } catch (e) {
    console.error("Error parsing request body", e);
  }

  const { message, sessionId, workspaceId, consoles } = body as {
    message?: string;
    sessionId?: string;
    workspaceId?: string;
    consoles?: any[];
  };

  if (!message || typeof message !== "string" || message.trim().length === 0) {
    return c.json({ error: "'message' is required" }, 400);
  }

  if (!workspaceId || !ObjectId.isValid(workspaceId)) {
    return c.json(
      { error: "'workspaceId' is required and must be valid" },
      400,
    );
  }

  // Get or create thread context
  const threadContext = await getOrCreateThreadContext(sessionId, workspaceId);

  // Build optimized context for the agent
  const agentInput = buildAgentContext(threadContext, message.trim());

  console.log("Thread context:", {
    threadId: threadContext.threadId,
    recentMessagesCount: threadContext.recentMessages.length,
    totalMessages: threadContext.metadata.messageCount,
  });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const runStream: any = await runAgent(
          createDbAgent(workspaceId, sendEvent, consoles),
          agentInput,
          {
            stream: true,
            maxTurns: 100,
          },
        );

        let assistantReply = "";
        let _eventCount = 0;
        let _textDeltaCount = 0;

        for await (const event of runStream as AsyncIterable<any>) {
          _eventCount++;

          // Process text deltas
          if (event?.type === "raw_model_stream_event") {
            const data = event.data;

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
              _textDeltaCount++;
              assistantReply += textDelta;
              sendEvent({ type: "text", content: textDelta });
            }
          }

          // Process tool events
          if (event?.type === "run_item_stream_event") {
            const itemEvent = event;
            const item = itemEvent.item;

            if (
              item?.type === "tool_call_item" &&
              itemEvent.name === "tool_called"
            ) {
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

            if (
              item?.type === "tool_call_output_item" &&
              itemEvent.name === "output_added"
            ) {
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

              if (toolName === "modify_console" && item.output) {
                try {
                  const outputData =
                    typeof item.output === "string"
                      ? JSON.parse(item.output)
                      : item.output;

                  if (outputData?.success && outputData?.modification) {
                    sendEvent({
                      type: "console_modification",
                      modification: outputData.modification,
                    });
                  }
                } catch (e) {
                  console.error("Failed to parse modify_console output:", e);
                }
              }
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

        await runStream.completed;

        if (!assistantReply && runStream.finalOutput) {
          assistantReply = runStream.finalOutput;
          sendEvent({ type: "text", content: assistantReply });
        }

        // Update messages with the new conversation turn
        const allMessages = [
          ...threadContext.recentMessages,
          { role: "user" as const, content: message.trim() },
          { role: "assistant" as const, content: assistantReply },
        ];

        // Persist the chat session with thread management
        const finalSessionId = await persistChatSession(
          sessionId,
          threadContext,
          allMessages,
          workspaceId,
        );

        // Send thread info
        sendEvent({
          type: "thread_info",
          threadId: threadContext.threadId,
          messageCount: allMessages.length,
        });

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
