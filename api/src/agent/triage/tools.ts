// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore – provided at runtime
import { Tool } from "@openai/agents";
import { createMongoTools } from "../mongodb/tools";
import { createBigQueryTools } from "../bigquery/tools";

export const createTriageTools = (
  workspaceId: string,
  consoles?: any[],
  preferredConsoleId?: string,
): Tool[] => {
  const mongo = createMongoTools(workspaceId, consoles, preferredConsoleId);
  const bq = createBigQueryTools(workspaceId, consoles, preferredConsoleId);

  // Allow discovery-only tools
  const allowed = new Set([
    "list_databases",
    "list_collections",
    "inspect_collection",
    "bq_list_datasets",
    "bq_list_tables",
    "bq_inspect_table",
  ]);

  const filtered = [...mongo, ...bq].filter((t: any) => {
    const name = t?.schema?.name || t?.name;
    return name && allowed.has(name);
  });

  // Dedupe by name
  const map = new Map<string, Tool>();
  for (const t of filtered) {
    const name = (t as any)?.schema?.name || (t as any)?.name;
    if (name && !map.has(name)) map.set(name, t);
  }
  return Array.from(map.values());
};
