// Agent type definitions

export type AgentKind = "mongo" | "bigquery" | "triage";

export interface AgentConfig {
  workspaceId: string;
  consoles?: any[];
  preferredConsoleId?: string;
}

export interface AgentMetadata {
  name: string;
  handoffDescription?: string;
  kind: AgentKind;
}

export interface AgentError {
  code: string;
  message: string;
  details?: any;
}
