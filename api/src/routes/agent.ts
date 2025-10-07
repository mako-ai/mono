import { Hono } from "hono";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore – module will be provided via dependency at runtime
import { run as runAgent } from "@openai/agents";
import { ObjectId } from "mongodb";
// title generation handled elsewhere; not used here
import { Chat } from "../database/workspace-schema";
import { createAgent, AgentKind } from "../agent";
import {
  getOrCreateThreadContext,
  buildAgentContext,
  persistChatSession,
} from "../services/agent-thread.service";

// Create a router that will be mounted at /api/agent
export const agentRoutes = new Hono();

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

  // No pre-detection; triage decides or we use pinned agent

  // Get or create thread context
  const threadContext = await getOrCreateThreadContext(sessionId, workspaceId);

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
      const sendEvent = (data: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        // Select agent: use pinned agent if present; else triage
        const pinned = (await Chat.findOne({
          _id: sessionId ? new ObjectId(sessionId) : undefined,
        })) as any;
        const activeAgent: AgentMode =
          (pinned?.activeAgent as AgentMode) || "triage";

        const agentInstance = createAgent(activeAgent as AgentKind, {
          workspaceId,
          sendEvent,
          consoles,
        });

        const runStream: any = await runAgent(agentInstance, agentInput, {
          stream: true,
          maxTurns: 100,
        });

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

        // Determine if a handoff occurred by scanning steps (tool names start with transfer_to_)
        // Note: we did not store steps; rely on assistantReply heuristics or agent side events in future improvements
        // For now, keep prior activeAgent if exists; if current was triage, pin based on consoles metadata if present
        let newActiveAgent: AgentMode | undefined = undefined;
        if (!pinned?.activeAgent) {
          const meta =
            Array.isArray(consoles) && consoles.length > 0
              ? consoles[0]?.metadata || {}
              : {};
          const type = (meta.type || meta.databaseType || "")
            .toString()
            .toLowerCase();
          if (type === "mongodb") newActiveAgent = "mongo";
          if (type === "bigquery") newActiveAgent = "bigquery";
        }

        // Persist the chat session with thread management and pinning
        const finalSessionId = await persistChatSession(
          sessionId,
          threadContext,
          allMessages,
          workspaceId,
          newActiveAgent,
        );

        // Send thread info
        sendEvent({
          type: "thread_info",
          threadId: threadContext.threadId,
          messageCount: allMessages.length,
        });

        // Echo selected agent for client diagnostics
        sendEvent({
          type: "agent_mode",
          mode: pinned?.activeAgent || newActiveAgent || "triage",
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
