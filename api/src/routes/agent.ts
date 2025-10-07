import { Hono } from "hono";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore – module will be provided via dependency at runtime
import { run as runAgent } from "@openai/agents";
import { ObjectId } from "mongodb";
// title generation handled elsewhere; not used here
import { Chat, Database } from "../database/workspace-schema";
import { createAgent, AgentKind } from "../agent";
import {
  getOrCreateThreadContext,
  buildAgentContext,
  persistChatSession,
} from "../services/agent-thread.service";
import { unifiedAuthMiddleware } from "../auth/unified-auth.middleware";
import { AuthenticatedContext } from "../middleware/workspace.middleware";
import {
  selectInitialAgent,
  getSelectionConfidence,
} from "../services/agent-selection.service";

// Create a router that will be mounted at /api/agent
export const agentRoutes = new Hono();

// Apply unified auth middleware to all agent routes
agentRoutes.use("*", unifiedAuthMiddleware);

// thread helpers moved to services

// removed DB helper/tool definitions from route

// removed DB helper/tool definitions from route

// removed DB helper/tool definitions from route

// removed DB helper/tool definitions from route

// ------------------------------------------------------------------------------------
// Tool wrappers: MongoDB
// ------------------------------------------------------------------------------------

// removed DB helper/tool definitions from route

// removed DB helper/tool definitions from route

// triage tools now provided implicitly through sub-agents' handoffs

// ------------------------------------------------------------------------------------
// Agent definitions with thread awareness and modes
// ------------------------------------------------------------------------------------

type AgentMode = "mongo" | "bigquery" | "triage";

// persistence moved to services

// ------------------------------------------------------------------------------------
// POST /stream - Threaded version with optimized context management
// ------------------------------------------------------------------------------------

agentRoutes.post("/stream", async (c: AuthenticatedContext) => {
  // Get authenticated user
  const user = c.get("user");
  const userId = user?.id;

  if (!userId) {
    return c.json({ error: "User not authenticated" }, 401);
  }

  let body: any = {};
  try {
    body = await c.req.json();
  } catch (e) {
    console.error("Error parsing request body", e);
  }

  const { message, sessionId, workspaceId, consoles, consoleId } = body as {
    message?: string;
    sessionId?: string;
    workspaceId?: string;
    consoles?: any[];
    consoleId?: string; // Explicit console ID to pin
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

  // No pre-detection; triage decides or we use pinned agent

  // Get or create thread context
  const threadContext = await getOrCreateThreadContext(
    sessionId,
    workspaceId,
    userId.toString(),
  );

  // Build optimized context for the agent
  const agentInput = buildAgentContext(threadContext, message.trim());

  // TODO: Replace with proper logging
  // console.log("Thread context:", {
  //   threadId: threadContext.threadId,
  //   recentMessagesCount: threadContext.recentMessages.length,
  //   totalMessages: threadContext.metadata.messageCount,
  // });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let isClosed = false;

      const sendEvent = (data: any) => {
        if (isClosed) return;
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
          );
        } catch (e) {
          console.error("Failed to send event:", e);
        }
      };

      try {
        // Get existing session if available
        const pinned = sessionId
          ? await Chat.findOne({
              _id: new ObjectId(sessionId),
              workspaceId: new ObjectId(workspaceId),
              createdBy: userId.toString(),
            })
          : null;

        // Get workspace database capabilities for smart selection
        const workspaceDatabases = await Database.find({
          workspaceId: new ObjectId(workspaceId),
        }).select({ type: 1 });

        const workspaceHasMongoDB = workspaceDatabases.some(
          db => db.type === "mongodb",
        );
        const workspaceHasBigQuery = workspaceDatabases.some(
          db => db.type === "bigquery",
        );

        // Use smart agent selection
        const sessionActiveAgent = (pinned as any)?.activeAgent as
          | AgentKind
          | undefined;
        const selectedAgent = selectInitialAgent({
          sessionActiveAgent,
          userMessage: message,
          consoles,
          workspaceHasMongoDB,
          workspaceHasBigQuery,
        });

        // Log selection confidence for debugging
        const selectionInfo = getSelectionConfidence(
          {
            sessionActiveAgent,
            userMessage: message,
            consoles,
            workspaceHasMongoDB,
            workspaceHasBigQuery,
          },
          selectedAgent,
        );
        console.log(
          `Agent selection: ${selectionInfo.agent} (${selectionInfo.confidence} confidence) - ${selectionInfo.reason}`,
        );

        const activeAgent: AgentMode = selectedAgent as AgentMode;

        // Use pinned console ID if available
        const effectiveConsoleId =
          consoleId || (pinned as any)?.pinnedConsoleId;

        const agentInstance = createAgent(activeAgent as AgentKind, {
          workspaceId,
          consoles,
          preferredConsoleId: effectiveConsoleId,
        });

        const runStream: any = await runAgent(agentInstance, agentInput, {
          stream: true,
          maxTurns: 20, // Allow enough turns for handoffs to complete
        });

        let assistantReply = "";
        let _eventCount = 0;
        let _textDeltaCount = 0;
        let currentAgent = activeAgent;

        // Add timeout to prevent hanging connections
        const timeout = setTimeout(() => {
          if (isClosed) return;
          console.error("Stream timeout - closing connection");
          sendEvent({ type: "timeout", message: "Stream timeout" });
          isClosed = true;
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        }, 120000); // 2 minute timeout

        try {
          for await (const event of runStream as AsyncIterable<any>) {
            _eventCount++;

            // Log all event types for debugging
            if (event?.type) {
              console.log(`[Agent Stream] Event type: ${event.type}`, {
                eventCount: _eventCount,
                hasData: !!event.data,
                hasItem: !!event.item,
              });
            }

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

              // Debug logging for all item types
              if (item?.type) {
                console.log(
                  `[Agent Stream] Item type: ${item.type}, Event name: ${itemEvent.name}`,
                );
                if (
                  item.type === "handoff_call_item" ||
                  item.type === "handoff_output_item" ||
                  item.type === "handoff_item" ||
                  item.type.includes("handoff")
                ) {
                  console.log(
                    `[Agent Stream] Handoff item:`,
                    JSON.stringify(item, null, 2),
                  );
                }
              }

              // Handle handoff events - just track them, don't interfere
              if (
                item?.type === "handoff_call_item" ||
                item?.type === "handoff_output_item"
              ) {
                const handoffAgent =
                  item.handoff_output?.agent_name ||
                  item.agent_name ||
                  item.name;
                console.log(
                  `[Agent Stream] Handoff detected to: ${handoffAgent}`,
                );

                // Just notify the UI about the handoff, let the library handle the actual transition
                if (handoffAgent) {
                  if (handoffAgent.includes("MongoDB")) {
                    currentAgent = "mongo";
                  } else if (handoffAgent.includes("BigQuery")) {
                    currentAgent = "bigquery";
                  }
                  sendEvent({
                    type: "agent_mode",
                    mode: currentAgent,
                  });
                }
              }

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

                // Check for console-related tool outputs
                if (item.output) {
                  try {
                    const outputData =
                      typeof item.output === "string"
                        ? JSON.parse(item.output)
                        : item.output;

                    // Handle console modifications and creations based on event markers
                    if (
                      outputData?._eventType === "console_modification" &&
                      outputData?.success
                    ) {
                      sendEvent({
                        type: "console_modification",
                        modification: outputData.modification,
                        consoleId: outputData.consoleId || effectiveConsoleId,
                      });
                    } else if (
                      outputData?._eventType === "console_creation" &&
                      outputData?.success
                    ) {
                      sendEvent({
                        type: "console_creation",
                        consoleId: outputData.consoleId,
                        title: outputData.title,
                        content: outputData.content,
                      });
                    }
                  } catch (e) {
                    console.error("Failed to parse tool output:", e);
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
        } catch (streamError: any) {
          // Handle stream processing errors
          console.error("Stream processing error:", streamError);
          clearTimeout(timeout);

          // Don't throw, just log and continue to close gracefully
          if (streamError.message !== "terminated") {
            sendEvent({
              type: "error",
              message: "Stream processing error",
            });
          }
        }

        try {
          await runStream.completed;
        } catch (completionError: any) {
          console.error("Stream completion error:", completionError);
          // Continue anyway - we may have partial results
        }

        clearTimeout(timeout);

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

        // Persist the chat session with thread management and pinning
        const finalSessionId = await persistChatSession(
          sessionId,
          threadContext,
          allMessages,
          workspaceId,
          currentAgent,
          userId.toString(),
          consoleId, // Pin the console if provided
        );

        // Send thread info
        sendEvent({
          type: "thread_info",
          threadId: threadContext.threadId,
          messageCount: allMessages.length,
        });

        sendEvent({ type: "session", sessionId: finalSessionId });
        isClosed = true;
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (err: any) {
        console.error("/api/agent/stream error", err);
        sendEvent({
          type: "error",
          message: err.message || "Unexpected error",
        });
        isClosed = true;
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
