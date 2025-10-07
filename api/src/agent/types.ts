// Agent type definitions

export type AgentKind = "mongo" | "bigquery" | "triage";

export interface AgentConfig {
  workspaceId: string;
  sendEvent?: (data: any) => void;
  consoles?: any[];
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
