import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

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
  collections: Record<string, CollectionInfo[]>; // databaseId => collections
  views: Record<string, CollectionInfo[]>; // databaseId => views
  loading: Record<string, boolean>; // workspace or database ids
  error: Record<string, string | null>;
  fetchServers: (workspaceId: string) => Promise<Server[]>;
  refreshServers: (workspaceId: string) => Promise<Server[]>;
  initServers: (workspaceId: string) => Promise<void>;
  fetchDatabaseData: (workspaceId: string, databaseId: string) => Promise<void>;
}

export const useDatabaseStore = create<DatabaseState>()(
  immer((set, get) => ({
    servers: {},
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
        const response = await fetch(
          `/api/workspaces/${workspaceId}/databases`,
        );
        const data = await response.json();
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
          set(state => {
            state.servers[workspaceId] = serversData;
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
        const [collectionsResponse, viewsResponse] = await Promise.all([
          fetch(
            `/api/workspaces/${workspaceId}/databases/${databaseId}/collections`,
          ),
          fetch(`/api/workspaces/${workspaceId}/databases/${databaseId}/views`),
        ]);
        const collectionsData = await collectionsResponse.json();
        const viewsData = await viewsResponse.json();
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
  })),
);
