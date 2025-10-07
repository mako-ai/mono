// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore – provided at runtime
import { Agent } from "@openai/agents";
import { createMongoTools } from "./tools";
import { MONGO_ASSISTANT_PROMPT } from "./prompt";

export const buildMongoAgent = (
  workspaceId: string,
  consoles?: any[],
  preferredConsoleId?: string,
) =>
  new Agent({
    name: "MongoDB Assistant",
    handoffDescription:
      "Specialist for MongoDB databases. Use when the task involves MongoDB collections or queries.",
    instructions: MONGO_ASSISTANT_PROMPT,
    tools: createMongoTools(workspaceId, consoles, preferredConsoleId),
    model: "gpt-5",
  });
