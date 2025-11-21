import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { apiClient } from "../lib/api-client";

export interface CollectionInfo {
  name: string;
  type: string;
  options: any;
}

export interface Database {
  id: string;
  name: string;
  description: string;
  database: string;
  type: string;
  active: boolean;
  lastConnectedAt?: string;
  displayName: string;
  hostKey: string;
  hostName: string;
}

export interface Server {
  id: string;
  name: string;
  description: string;
  connectionString: string;
  active: boolean;
  databases: Database[];
}

interface DatabaseState {
  servers: Record<string, Server[]>; // workspaceId => servers array
  databases: Database[]; // Flat list of all databases for current workspace
  collections: Record<string, CollectionInfo[]>; // databaseId => collections
  views: Record<string, CollectionInfo[]>; // databaseId => views
  loading: Record<string, boolean>; // workspace or database ids
  error: Record<string, string | null>;
  fetchServers: (workspaceId: string) => Promise<Server[]>;
  refreshServers: (workspaceId: string) => Promise<Server[]>;
  initServers: (workspaceId: string) => Promise<void>;
  fetchDatabaseData: (workspaceId: string, databaseId: string) => Promise<void>;
  clearDatabaseData: (workspaceId: string) => void;
  fetchDatabases: () => Promise<void>;
  deleteDatabase: (workspaceId: string, databaseId: string) => Promise<void>;
}

export const useDatabaseStore = create<DatabaseState>()(
  immer((set, get) => ({
    servers: {},
    databases: [],
    collections: {},
    views: {},
    loading: {},
    error: {},
    fetchServers: async workspaceId => {
      set(state => {
        state.loading[workspaceId] = true;
        state.error[workspaceId] = null;
      });
      try {
        const data = await apiClient.get<{
          success: boolean;
          data: Database[];
        }>(`/workspaces/${workspaceId}/databases`);
        if (data.success) {
          const serverMap = new Map<string, Server>();
          (data.data as Database[]).forEach(db => {
            const hostKey = db.hostKey;
            if (!serverMap.has(hostKey)) {
              serverMap.set(hostKey, {
                id: hostKey,
                name: db.hostName,
                description: "",
                connectionString: hostKey,
                active: true,
                databases: [],
              });
            }
            const server = serverMap.get(hostKey)!;
            server.databases.push(db);
          });
          const serversData = Array.from(serverMap.values());
          const allDatabases = serversData.flatMap(s => s.databases);
          set(state => {
            state.servers[workspaceId] = serversData;
            state.databases = allDatabases;
          });
          return serversData;
        }
        return [];
      } catch (err: any) {
        console.error("Failed to fetch servers", err);
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
    refreshServers: async workspaceId => {
      // Clear cached collections/views first so any new server state triggers fresh fetches
      get().clearDatabaseData(workspaceId);
      return await get().fetchServers(workspaceId);
    },
    initServers: async workspaceId => {
      const hasServers = !!get().servers[workspaceId];
      if (!hasServers) {
        await get().fetchServers(workspaceId);
      }
    },
    fetchDatabaseData: async (workspaceId, databaseId) => {
      // mark loading
      const loadingKey = `db:${databaseId}`;
      set(state => {
        state.loading[loadingKey] = true;
      });
      try {
        const [collectionsData, viewsData] = await Promise.all([
          apiClient.get<{
            success: boolean;
            data: CollectionInfo[];
          }>(`/workspaces/${workspaceId}/databases/${databaseId}/collections`),
          apiClient.get<{
            success: boolean;
            data: CollectionInfo[];
          }>(`/workspaces/${workspaceId}/databases/${databaseId}/views`),
        ]);
        if (collectionsData.success) {
          set(state => {
            state.collections[databaseId] = collectionsData.data.sort(
              (a: CollectionInfo, b: CollectionInfo) =>
                a.name.localeCompare(b.name),
            );
          });
        }
        if (viewsData.success) {
          set(state => {
            state.views[databaseId] = viewsData.data.sort(
              (a: CollectionInfo, b: CollectionInfo) =>
                a.name.localeCompare(b.name),
            );
          });
        }
      } catch (err) {
        console.error(`Failed to fetch database data for ${databaseId}`, err);
      } finally {
        set(state => {
          delete state.loading[loadingKey];
        });
      }
    },
    /**
     * Clears cached collections and views that belong to the provided workspace.
     * This is useful when refreshing the list of databases to ensure nested data
     * is fetched again and reflects the latest state on the server.
     */
    clearDatabaseData: (workspaceId: string) => {
      const serversForWorkspace = get().servers[workspaceId] || [];
      const dbIdsToClear = serversForWorkspace.flatMap(s =>
        s.databases.map(db => db.id),
      );

      if (dbIdsToClear.length === 0) return;

      set(state => {
        dbIdsToClear.forEach(dbId => {
          delete state.collections[dbId];
          delete state.views[dbId];
        });
      });
    },

    fetchDatabases: async () => {
      // This is a simplified method that just ensures we have databases loaded
      // It uses the already loaded databases from fetchServers
      const workspaceId = localStorage.getItem("activeWorkspaceId");
      if (workspaceId && !get().servers[workspaceId]) {
        await get().fetchServers(workspaceId);
      }
    },

    deleteDatabase: async (workspaceId: string, databaseId: string) => {
      const response = await apiClient.delete<{ success: boolean }>(
        `/workspaces/${workspaceId}/databases/${databaseId}`,
      );

      if (response.success) {
        // Refresh the servers list to reflect the deletion
        await get().refreshServers(workspaceId);
      }
    },
  })),
);
