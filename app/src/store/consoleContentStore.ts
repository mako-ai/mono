import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

interface ConsoleContentEntry {
  content: string;
  databaseId?: string;
  lastFetchedAt: number;
}

interface ConsoleContentState {
  byId: Record<string, ConsoleContentEntry>;
  get: (consoleId: string) => ConsoleContentEntry | undefined;
  set: (
    consoleId: string,
    entry: { content: string; databaseId?: string },
  ) => void;
  clear: (consoleId?: string) => void;
}

export const useConsoleContentStore = create<ConsoleContentState>()(
  immer((set, get) => ({
    byId: {},
    get: consoleId => get().byId[consoleId],
    set: (consoleId, entry) => {
      set(state => {
        state.byId[consoleId] = {
          content: entry.content,
          databaseId: entry.databaseId,
          lastFetchedAt: Date.now(),
        };
      });
    },
    clear: consoleId => {
      set(state => {
        if (consoleId) {
          delete state.byId[consoleId];
        } else {
          state.byId = {};
        }
      });
    },
  })),
);
