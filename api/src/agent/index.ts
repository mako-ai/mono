/**
 * Agent module exports
 * Provides a clean API for agent functionality
 */

// Type exports
export { AgentKind, AgentConfig, AgentMetadata, AgentError } from "./types";

// Agent builders
export { buildMongoAgent } from "./mongodb/agent";
export { buildBigQueryAgent } from "./bigquery/agent";
export { buildTriageAgent } from "./triage/agent";

// Tool creators (if needed externally)
export { createMongoTools } from "./mongodb/tools";
export { createBigQueryTools } from "./bigquery/tools";
export { createTriageTools } from "./triage/tools";

// Shared utilities
export {
  createConsoleTools,
  ConsoleModification,
  ConsoleData,
  ConsoleEvent,
  SendEventFunction,
} from "./shared/console-tools";

// Re-export legacy functions from agent.ts for backward compatibility
export {
  createMongoAgent,
  createBigQueryAgent,
  createTriageAgent,
} from "./agent";

// Factory functions
export {
  createAgent,
  getSupportedAgentKinds,
  isAgentKindSupported,
} from "./factory";
