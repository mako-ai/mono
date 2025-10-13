// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore – provided at runtime
import { Agent } from "@openai/agents";
import { createPostgresTools } from "./tools";
import { POSTGRES_ASSISTANT_PROMPT } from "./prompt";

export const buildPostgresAgent = (
  workspaceId: string,
  consoles?: any[],
  preferredConsoleId?: string,
) =>
  new Agent({
    name: "Postgres Assistant",
    handoffDescription:
      "Specialist for PostgreSQL databases and SQL. Use when a task targets relational data in Postgres.",
    instructions: POSTGRES_ASSISTANT_PROMPT,
    tools: createPostgresTools(workspaceId, consoles, preferredConsoleId),
    model: "gpt-5",
  });
