// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore – provided at runtime
import { tool } from "@openai/agents";

export interface ConsoleModification {
  action: "replace" | "insert" | "append";
  content: string;
  position?: number;
}

export interface ConsoleData {
  id: string;
  title: string;
  content: string;
  metadata?: Record<string, any>;
}

export interface ConsoleEvent {
  type: "console_modification";
  modification: ConsoleModification;
}

export type SendEventFunction = (data: ConsoleEvent) => void;

export const createConsoleTools = (
  sendEvent?: SendEventFunction,
  consoles?: ConsoleData[],
) => {
  const modifyConsoleTool = tool({
    name: "modify_console",
    description: "Modify the console editor content.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["replace", "insert", "append"],
          description: "The type of modification to perform",
        },
        content: {
          type: "string",
          description: "The content to add or replace",
        },
        position: {
          type: "number",
          description: "Optional position for insert action",
        },
      },
      required: ["action", "content"],
      additionalProperties: false,
    },
    execute: async (input: ConsoleModification) => {
      const modification: ConsoleModification = {
        action: input.action,
        content: input.content,
        position: input.position,
      };

      if (sendEvent) {
        sendEvent({ type: "console_modification", modification });
      }

      return {
        success: true,
        modification,
        message: `✓ Console ${input.action}d successfully`,
      };
    },
  });

  const readConsoleTool = tool({
    name: "read_console",
    description: "Read the contents of the current console editor.",
    parameters: {
      type: "object",
      properties: {
        consoleId: {
          type: "string",
          description:
            "Optional console ID to read from. If not provided, reads the active console.",
        },
      },
      required: [],
      additionalProperties: false,
    },
    execute: async (input: { consoleId?: string }) => {
      const consolesData = consoles || [];
      const { consoleId } = input;

      if (consoleId) {
        const console = consolesData.find(c => c.id === consoleId);
        if (!console) {
          return {
            success: false,
            error: `Console with ID ${consoleId} not found`,
          };
        }
        return {
          success: true,
          consoleId: console.id,
          title: console.title,
          content: console.content || "",
          metadata: console.metadata || {},
        };
      }

      // Return the first (active) console
      if (consolesData.length > 0) {
        const activeConsole = consolesData[0];
        return {
          success: true,
          consoleId: activeConsole.id,
          title: activeConsole.title,
          content: activeConsole.content || "",
          metadata: activeConsole.metadata || {},
        };
      }

      return {
        success: false,
        error: "No console is currently active",
      };
    },
  });

  return [modifyConsoleTool, readConsoleTool];
};
