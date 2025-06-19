import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

export interface ConsoleEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: ConsoleEntry[];
  content?: string;
  id?: string;
  folderId?: string;
  databaseId?: string;
  language?: "sql" | "javascript" | "mongodb";
  description?: string;
  isPrivate?: boolean;
  lastExecutedAt?: Date;
  executionCount?: number;
}

interface TreeState {
  trees: Record<string, ConsoleEntry[]>; // workspaceId => tree
  loading: Record<string, boolean>; // workspaceId => bool
  error: Record<string, string | null>;
  fetchTree: (workspaceId: string) => Promise<ConsoleEntry[]>;
  refresh: (workspaceId: string) => Promise<ConsoleEntry[]>;
  init: (workspaceId: string) => Promise<void>;
  // Future mutations
}

export const useConsoleTreeStore = create<TreeState>()(
  immer((set, _get) => ({
    trees: {},
    loading: {},
    error: {},
    fetchTree: async workspaceId => {
      set(state => {
        state.loading[workspaceId] = true;
        state.error[workspaceId] = null;
      });
      try {
        const response = await fetch(`/api/workspaces/${workspaceId}/consoles`);
        const data = await response.json();
        if (data.tree && Array.isArray(data.tree)) {
          set(state => {
            state.trees[workspaceId] = data.tree as ConsoleEntry[];
          });
          return data.tree;
        }
        return [];
      } catch (err: any) {
        console.error("Failed to fetch console tree", err);
        set(state => {
          state.error[workspaceId] = err?.message || "Failed to fetch";
        });
        return [];
      } finally {
        set(state => {
          delete state.loading[workspaceId];
        });
      }
    },
    refresh: async workspaceId => {
      return await _get().fetchTree(workspaceId);
    },
    init: async workspaceId => {
      const hasData = !!_get().trees[workspaceId];
      if (!hasData) {
        await _get().fetchTree(workspaceId);
      }
    },
  })),
);
