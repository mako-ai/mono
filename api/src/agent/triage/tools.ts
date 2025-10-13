// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore – provided at runtime
import { Tool } from "@openai/agents";
import { AgentConfig, AgentRegistration } from "../types";
import { listAgentRegistrations } from "../registry";

const getToolName = (tool: Tool): string | undefined =>
  (tool as any)?.schema?.name || (tool as any)?.name;

const buildConfig = (
  workspaceId: string,
  consoles?: any[],
  preferredConsoleId?: string,
): AgentConfig => ({
  workspaceId,
  consoles,
  preferredConsoleId,
});

const gatherDiscoveryTools = (
  registration: AgentRegistration,
  config: AgentConfig,
): Tool[] => {
  if (!registration.createTools || !registration.discoveryToolNames?.length) {
    return [];
  }

  const allowedNames = new Set(registration.discoveryToolNames);
  const tools = registration.createTools(config);

  return tools.filter(tool => {
    const name = getToolName(tool);
    return name ? allowedNames.has(name) : false;
  });
};

export const createTriageTools = (
  workspaceId: string,
  consoles?: any[],
  preferredConsoleId?: string,
): Tool[] => {
  const config = buildConfig(workspaceId, consoles, preferredConsoleId);

  const toolsByName = new Map<string, Tool>();

  for (const registration of listAgentRegistrations()) {
    const discoveryTools = gatherDiscoveryTools(registration, config);
    for (const tool of discoveryTools) {
      const name = getToolName(tool);
      if (name && !toolsByName.has(name)) {
        toolsByName.set(name, tool);
      }
    }
  }

  return Array.from(toolsByName.values());
};
