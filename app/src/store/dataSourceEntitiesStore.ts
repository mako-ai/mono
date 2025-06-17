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
}

function makeKey(workspaceId: string, sourceId: string) {
  return `${workspaceId}:${sourceId}`;
}

export const useDataSourceEntitiesStore = create<EntitiesState>()(
  immer(set => ({
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
  })),
);
