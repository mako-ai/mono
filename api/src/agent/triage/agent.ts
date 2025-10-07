// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore – provided at runtime
import { Agent, handoff } from "@openai/agents";
import { TRIAGE_ASSISTANT_PROMPT } from "./prompt";
import { buildMongoAgent } from "../mongodb/agent";
import { buildBigQueryAgent } from "../bigquery/agent";
import { createTriageTools } from "./tools";

export const buildTriageAgent = (
  workspaceId: string,
  consoles?: any[],
  preferredConsoleId?: string,
) => {
  const mongoAgent = buildMongoAgent(workspaceId, consoles, preferredConsoleId);
  const bqAgent = buildBigQueryAgent(workspaceId, consoles, preferredConsoleId);
  return Agent.create({
    name: "Database Triage Agent",
    instructions: TRIAGE_ASSISTANT_PROMPT,
    // Lightweight discovery tools to inspect available schemas before delegating
    tools: createTriageTools(workspaceId, consoles, preferredConsoleId),
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
