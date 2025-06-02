import { create } from "zustand";
import { persist } from "zustand/middleware";

interface DatabaseExplorerState {
  // Expanded states
  expandedServers: Set<string>;
  expandedDatabases: Set<string>;
  expandedCollectionGroups: Set<string>;
  expandedViewGroups: Set<string>;

  // Actions
  toggleServer: (serverId: string) => void;
  toggleDatabase: (databaseId: string) => void;
  toggleCollectionGroup: (databaseId: string) => void;
  toggleViewGroup: (databaseId: string) => void;
  expandServer: (serverId: string) => void;
  expandDatabase: (databaseId: string) => void;
  isServerExpanded: (serverId: string) => boolean;
  isDatabaseExpanded: (databaseId: string) => boolean;
  isCollectionGroupExpanded: (databaseId: string) => boolean;
  isViewGroupExpanded: (databaseId: string) => boolean;
}

export const useDatabaseExplorerStore = create<DatabaseExplorerState>()(
  persist(
    (set, get) => ({
      // Initial states - using Sets for efficient lookup
      expandedServers: new Set<string>(),
      expandedDatabases: new Set<string>(),
      expandedCollectionGroups: new Set<string>(),
      expandedViewGroups: new Set<string>(),

      // Actions
      toggleServer: (serverId) =>
        set((state) => {
          const newSet = new Set(state.expandedServers);
          if (newSet.has(serverId)) {
            newSet.delete(serverId);
          } else {
            newSet.add(serverId);
          }
          return { expandedServers: newSet };
        }),

      toggleDatabase: (databaseId) =>
        set((state) => {
          const newSet = new Set(state.expandedDatabases);
          if (newSet.has(databaseId)) {
            newSet.delete(databaseId);
          } else {
            newSet.add(databaseId);
          }
          return { expandedDatabases: newSet };
        }),

      toggleCollectionGroup: (databaseId) =>
        set((state) => {
          const newSet = new Set(state.expandedCollectionGroups);
          if (newSet.has(databaseId)) {
            newSet.delete(databaseId);
          } else {
            newSet.add(databaseId);
          }
          return { expandedCollectionGroups: newSet };
        }),

      toggleViewGroup: (databaseId) =>
        set((state) => {
          const newSet = new Set(state.expandedViewGroups);
          if (newSet.has(databaseId)) {
            newSet.delete(databaseId);
          } else {
            newSet.add(databaseId);
          }
          return { expandedViewGroups: newSet };
        }),

      expandServer: (serverId) =>
        set((state) => {
          const newSet = new Set(state.expandedServers);
          newSet.add(serverId);
          return { expandedServers: newSet };
        }),

      expandDatabase: (databaseId) =>
        set((state) => {
          const newSet = new Set(state.expandedDatabases);
          newSet.add(databaseId);
          return { expandedDatabases: newSet };
        }),

      // Helper methods to check expanded state
      isServerExpanded: (serverId) => get().expandedServers.has(serverId),
      isDatabaseExpanded: (databaseId) =>
        get().expandedDatabases.has(databaseId),
      isCollectionGroupExpanded: (databaseId) =>
        get().expandedCollectionGroups.has(databaseId),
      isViewGroupExpanded: (databaseId) =>
        get().expandedViewGroups.has(databaseId),
    }),
    {
      name: "database-explorer-store", // unique name for localStorage key
      // Custom serialization for Sets
      partialize: (state) => ({
        expandedServers: Array.from(state.expandedServers),
        expandedDatabases: Array.from(state.expandedDatabases),
        expandedCollectionGroups: Array.from(state.expandedCollectionGroups),
        expandedViewGroups: Array.from(state.expandedViewGroups),
      }),
      // Custom deserialization for Sets
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.expandedServers = new Set(state.expandedServers as any);
          state.expandedDatabases = new Set(state.expandedDatabases as any);
          state.expandedCollectionGroups = new Set(
            state.expandedCollectionGroups as any
          );
          state.expandedViewGroups = new Set(state.expandedViewGroups as any);
        }
      },
    }
  )
);
