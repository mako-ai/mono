// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore – provided at runtime
import { Agent, handoff } from "@openai/agents";
import { createMongoTools } from "./mongodb/tools";
import { createBigQueryTools } from "./bigquery/tools";
import { MONGO_ASSISTANT_PROMPT } from "./mongodb/prompt";
import { BIGQUERY_ASSISTANT_PROMPT } from "./bigquery/prompt";
import { TRIAGE_ASSISTANT_PROMPT } from "./triage/prompt";
import { AgentKind, AgentConfig } from "./types";

export const createMongoAgent = (
  workspaceId: string,
  sendEvent?: (data: any) => void,
  consoles?: any[],
) =>
  new Agent({
    name: "MongoDB Assistant",
    handoffDescription:
      "Specialist for MongoDB databases. Use when the task involves MongoDB collections or queries.",
    instructions: MONGO_ASSISTANT_PROMPT,
    tools: createMongoTools(workspaceId, sendEvent, consoles),
    model: "gpt-5",
  });

export const createBigQueryAgent = (
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

// Triage agent delegates to specialists via handoffs and has lightweight discovery tools
export const createTriageAgent = (
  workspaceId: string,
  sendEvent?: (data: any) => void,
  consoles?: any[],
) => {
  const mongoAgent = createMongoAgent(workspaceId, sendEvent, consoles);
  const bqAgent = createBigQueryAgent(workspaceId, sendEvent, consoles);

  // Provide minimal discovery tools by reusing specialist tool builders and filtering there if desired.
  // For now, we let the triage agent run without heavy execution tools; the LLM should immediately handoff.
  return Agent.create({
    name: "Database Triage Agent",
    instructions: TRIAGE_ASSISTANT_PROMPT,
    handoffs: [
      handoff(mongoAgent, {
        toolNameOverride: "transfer_to_mongodb",
        toolDescriptionOverride:
          "Transfer the conversation to the MongoDB Assistant for MongoDB-related tasks.",
      }),
      handoff(bqAgent, {
        toolNameOverride: "transfer_to_bigquery",
        toolDescriptionOverride:
          "Transfer the conversation to the BigQuery Assistant for BigQuery-related tasks.",
      }),
    ],
    model: "gpt-5",
  });
};
