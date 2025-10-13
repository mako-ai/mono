// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore – provided at runtime
import { Agent, handoff } from "@openai/agents";
import { TRIAGE_ASSISTANT_PROMPT } from "./prompt";
import { createTriageTools } from "./tools";
import { AgentConfig } from "../types";
import { listAgentRegistrations } from "../registry";

const buildAgentConfig = (
  workspaceId: string,
  consoles?: any[],
  preferredConsoleId?: string,
): AgentConfig => ({
  workspaceId,
  consoles,
  preferredConsoleId,
});

const buildHandoffs = (config: AgentConfig) =>
  listAgentRegistrations()
    .filter(registration => registration.handoff)
    .map(registration => {
      const agentInstance = registration.buildAgent(config);

      return handoff(agentInstance, {
        toolNameOverride: registration.handoff?.toolName,
        toolDescriptionOverride:
          registration.handoff?.description ||
          registration.metadata.handoffDescription,
      });
    });

export const buildTriageAgent = (
  workspaceId: string,
  consoles?: any[],
  preferredConsoleId?: string,
) => {
  const config = buildAgentConfig(workspaceId, consoles, preferredConsoleId);

  return Agent.create({
    name: "Database Triage Agent",
    instructions: TRIAGE_ASSISTANT_PROMPT,
    // Lightweight discovery tools to inspect available schemas before delegating
    tools: createTriageTools(workspaceId, consoles, preferredConsoleId),
    handoffs: buildHandoffs(config),
    model: "gpt-5",
  });
};
