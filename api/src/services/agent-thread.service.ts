import { ObjectId } from "mongodb";
import { v4 as uuidv4 } from "uuid";
import { Chat } from "../database/workspace-schema";
import { AgentKind } from "../agent/types";

const CONTEXT_WINDOW_SIZE = 10;
const MAX_CONTEXT_LENGTH = 4000;

export interface ThreadContext {
  threadId: string;
  recentMessages: Array<{ role: "user" | "assistant"; content: string }>;
  metadata: { messageCount: number; lastActivityAt: Date };
  activeAgent?: AgentKind;
}

export const getOrCreateThreadContext = async (
  sessionId: string | undefined,
  workspaceId: string,
  userId?: string,
): Promise<ThreadContext> => {
  if (sessionId) {
    const query: any = {
      _id: new ObjectId(sessionId),
      workspaceId: new ObjectId(workspaceId),
    };
    // Add user filter if userId is provided
    if (userId) {
      query.createdBy = userId;
    }

    const existingChat = await Chat.findOne(query);
    if (existingChat) {
      const messages = existingChat.messages || [];
      const recentMessages = messages.slice(-CONTEXT_WINDOW_SIZE);
      let threadId = existingChat.threadId;
      if (!threadId) {
        threadId = uuidv4();
        await Chat.findByIdAndUpdate(sessionId, { threadId });
      }
      return {
        threadId,
        recentMessages,
        metadata: {
          messageCount: messages.length,
          lastActivityAt: existingChat.updatedAt,
        },
        activeAgent: (existingChat as any).activeAgent,
      };
    }
  }
  return {
    threadId: uuidv4(),
    recentMessages: [],
    metadata: { messageCount: 0, lastActivityAt: new Date() },
    activeAgent: undefined,
  };
};

export const buildAgentContext = (
  threadContext: ThreadContext,
  newMessage: string,
): string => {
  const contextParts: string[] = [];
  if (threadContext.metadata.messageCount > CONTEXT_WINDOW_SIZE) {
    contextParts.push(
      `[Previous ${threadContext.metadata.messageCount - CONTEXT_WINDOW_SIZE} messages omitted]\n`,
    );
  }
  if (threadContext.recentMessages.length > 0) {
    contextParts.push("Recent conversation:");
    for (const msg of threadContext.recentMessages) {
      const speaker = msg.role === "user" ? "User" : "Assistant";
      contextParts.push(`${speaker}: ${msg.content}`);
    }
    contextParts.push("");
  }
  contextParts.push(`User: ${newMessage}`);
  const fullContext = contextParts.join("\n");
  if (fullContext.length > MAX_CONTEXT_LENGTH) {
    const truncatedContext = fullContext.substring(
      fullContext.length - MAX_CONTEXT_LENGTH,
    );
    return `[Context truncated]\n...${truncatedContext}`;
  }
  return fullContext;
};

export const persistChatSession = async (
  sessionId: string | undefined,
  threadContext: ThreadContext,
  updatedMessages: any[],
  workspaceId: string,
  activeAgent?: AgentKind,
  userId?: string,
  pinnedConsoleId?: string,
): Promise<string> => {
  const now = new Date();
  if (!sessionId) {
    const newChat = new Chat({
      workspaceId: new ObjectId(workspaceId),
      threadId: threadContext.threadId,
      title: "New Chat",
      messages: updatedMessages,
      createdBy: userId || "system",
      titleGenerated: false,
      createdAt: now,
      updatedAt: now,
      activeAgent,
      pinnedConsoleId,
    });
    await newChat.save();
    return newChat._id.toString();
  }
  const updateData: any = { messages: updatedMessages, updatedAt: now };
  if (!threadContext.threadId) {
    updateData.threadId = uuidv4();
  }
  if (activeAgent) {
    updateData.activeAgent = activeAgent;
  }
  if (pinnedConsoleId !== undefined) {
    updateData.pinnedConsoleId = pinnedConsoleId;
  }
  await Chat.findByIdAndUpdate(sessionId, updateData, { new: true });
  return sessionId;
};
