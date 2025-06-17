import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

interface DataSourceEntity {
  _id: string;
  name: string;
  description?: string;
  type: string;
  isActive: boolean;
  config: Record<string, any>;
  settings: Record<string, any>;
  targetDatabases?: string[];
  createdAt: string;
  updatedAt: string;
  workspaceId: string;
}

interface EntitiesState {
  entities: Record<string, DataSourceEntity>; // key = `${workspaceId}:${sourceId}`
  loading: Record<string, boolean>; // key same as entities key
  fetchOne: (
    workspaceId: string,
    sourceId: string,
  ) => Promise<DataSourceEntity | null>;
  fetchAll: (workspaceId: string) => Promise<DataSourceEntity[]>;
  upsert: (entity: DataSourceEntity) => void;
  remove: (workspaceId: string, sourceId: string) => void;
  init: (workspaceId: string) => Promise<void>;
  refresh: (workspaceId: string) => Promise<DataSourceEntity[]>;
  create: (
    workspaceId: string,
    payload: Record<string, any>,
  ) => Promise<{ data: DataSourceEntity | null; error: string | null }>;
  update: (
    workspaceId: string,
    sourceId: string,
    payload: Record<string, any>,
  ) => Promise<{ data: DataSourceEntity | null; error: string | null }>;
  delete: (
    workspaceId: string,
    sourceId: string,
  ) => Promise<{ success: boolean; error: string | null }>;
}

function makeKey(workspaceId: string, sourceId: string) {
  return `${workspaceId}:${sourceId}`;
}

export const useDataSourceEntitiesStore = create<EntitiesState>()(
  immer((set, get) => ({
    entities: {},
    loading: {},
    fetchOne: async (workspaceId, sourceId) => {
      const key = makeKey(workspaceId, sourceId);
      let entity: DataSourceEntity | undefined;
      set(state => {
        entity = state.entities[key];
        if (!entity) state.loading[key] = true;
      });
      if (entity) return entity;
      try {
        const response = await fetch(
          `/api/workspaces/${workspaceId}/sources/${sourceId}`,
        );
        const data = await response.json();
        if (data.success) {
          set(state => {
            state.entities[key] = { ...data.data, workspaceId };
            delete state.loading[key];
          });
          return data.data;
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("Failed to fetch data source", err);
      } finally {
        set(state => {
          delete state.loading[key];
        });
      }
      return null;
    },
    fetchAll: async workspaceId => {
      // Indicate loading for workspace list
      set(state => {
        state.loading[workspaceId] = true;
      });

      try {
        const response = await fetch(`/api/workspaces/${workspaceId}/sources`);
        const data = await response.json();
        if (data.success) {
          set(state => {
            data.data.forEach((ds: any) => {
              const key = makeKey(workspaceId, ds._id);
              state.entities[key] = { ...ds, workspaceId };
            });
          });
          return data.data;
        }
      } catch (err) {
        console.error("Failed to fetch sources list", err);
      } finally {
        set(state => {
          delete state.loading[workspaceId];
        });
      }

      return [];
    },
    upsert: entity =>
      set(state => {
        const key = makeKey(entity.workspaceId, entity._id);
        state.entities[key] = entity;
      }),
    remove: (workspaceId, sourceId) =>
      set(state => {
        const key = makeKey(workspaceId, sourceId);
        delete state.entities[key];
      }),
    init: async (workspaceId: string) => {
      let hasEntities = false;
      set(state => {
        hasEntities = Object.values(state.entities).some(
          e => e.workspaceId === workspaceId,
        );
      });

      if (!hasEntities) {
        await get().fetchAll(workspaceId);
      }
    },
    refresh: async (workspaceId: string) => {
      return await get().fetchAll(workspaceId);
    },
    create: async (
      workspaceId: string,
      payload: Record<string, any>,
    ): Promise<{ data: DataSourceEntity | null; error: string | null }> => {
      try {
        const response = await fetch(`/api/workspaces/${workspaceId}/sources`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await response.json();
        if (data.success) {
          const entity = { ...data.data, workspaceId } as DataSourceEntity;
          set(state => {
            const key = makeKey(workspaceId, entity._id);
            state.entities[key] = entity;
          });
          return { data: entity, error: null };
        }
        return { data: null, error: data.error || "Failed to create" };
      } catch (err: any) {
        console.error("Create data source failed", err);
        return {
          data: null,
          error: err?.message || "Failed to create",
        };
      }
    },
    update: async (
      workspaceId: string,
      sourceId: string,
      payload: Record<string, any>,
    ): Promise<{ data: DataSourceEntity | null; error: string | null }> => {
      try {
        const response = await fetch(
          `/api/workspaces/${workspaceId}/sources/${sourceId}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        const data = await response.json();
        if (data.success) {
          const entity = { ...data.data, workspaceId } as DataSourceEntity;
          set(state => {
            const key = makeKey(workspaceId, entity._id);
            state.entities[key] = entity;
          });
          return { data: entity, error: null };
        }
        return { data: null, error: data.error || "Failed to update" };
      } catch (err: any) {
        console.error("Update data source failed", err);
        return {
          data: null,
          error: err?.message || "Failed to update",
        };
      }
    },
    delete: async (
      workspaceId: string,
      sourceId: string,
    ): Promise<{ success: boolean; error: string | null }> => {
      try {
        const response = await fetch(
          `/api/workspaces/${workspaceId}/sources/${sourceId}`,
          { method: "DELETE" },
        );
        const data = await response.json();
        if (data.success) {
          set(state => {
            const key = makeKey(workspaceId, sourceId);
            delete state.entities[key];
          });
          return { success: true, error: null };
        }
        return {
          success: false,
          error: data.error || "Failed to delete",
        };
      } catch (err: any) {
        console.error("Delete data source failed", err);
        return {
          success: false,
          error: err?.message || "Failed to delete",
        };
      }
    },
  })),
);
