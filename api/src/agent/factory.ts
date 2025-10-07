import { AgentKind, AgentConfig } from "./types";
import { buildMongoAgent } from "./mongodb/agent";
import { buildBigQueryAgent } from "./bigquery/agent";
import { buildTriageAgent } from "./triage/agent";

type AgentBuilder = (
  workspaceId: string,
  sendEvent?: (data: any) => void,
  consoles?: any[],
) => any; // Will be properly typed when we add interfaces

const agentBuilders: Record<AgentKind, AgentBuilder> = {
  mongo: buildMongoAgent,
  bigquery: buildBigQueryAgent,
  triage: buildTriageAgent,
};

/**
 * Factory function to create agents based on kind
 * @param kind - The type of agent to create
 * @param config - Configuration for the agent
 * @returns The created agent instance
 * @throws Error if agent kind is not supported
 */
export function createAgent(kind: AgentKind, config: AgentConfig): any {
  const builder = agentBuilders[kind];

  if (!builder) {
    throw new Error(`Unsupported agent kind: ${kind}`);
  }

  return builder(config.workspaceId, config.sendEvent, config.consoles);
}

/**
 * Get all supported agent kinds
 * @returns Array of supported agent kinds
 */
export function getSupportedAgentKinds(): AgentKind[] {
  return Object.keys(agentBuilders) as AgentKind[];
}

/**
 * Check if an agent kind is supported
 * @param kind - The agent kind to check
 * @returns True if the agent kind is supported
 */
export function isAgentKindSupported(kind: string): kind is AgentKind {
  return kind in agentBuilders;
}
