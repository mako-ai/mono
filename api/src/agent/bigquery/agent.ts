// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore – provided at runtime
import { Agent } from "@openai/agents";
import { createBigQueryTools } from "./tools";
import { BIGQUERY_ASSISTANT_PROMPT } from "./prompt";

export const buildBigQueryAgent = (
  workspaceId: string,
  sendEvent?: (data: any) => void,
  consoles?: any[],
) =>
  new Agent({
    name: "BigQuery Assistant",
    handoffDescription:
      "Specialist for BigQuery datasets and SQL. Use when the task targets analytics tables in BigQuery.",
    instructions: BIGQUERY_ASSISTANT_PROMPT,
    tools: createBigQueryTools(workspaceId, sendEvent, consoles),
    model: "gpt-5",
  });
