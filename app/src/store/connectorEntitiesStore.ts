import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { apiClient } from "../lib/api-client";

interface ConnectorEntity {
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
  entities: Record<string, ConnectorEntity>; // key = `${workspaceId}:${connectorId}`
  loading: Record<string, boolean>; // key same as entities key
  fetchOne: (
    workspaceId: string,
    connectorId: string,
  ) => Promise<ConnectorEntity | null>;
  fetchAll: (workspaceId: string) => Promise<ConnectorEntity[]>;
  upsert: (entity: ConnectorEntity) => void;
  remove: (workspaceId: string, connectorId: string) => void;
  init: (workspaceId: string) => Promise<void>;
  refresh: (workspaceId: string) => Promise<ConnectorEntity[]>;
  create: (
    workspaceId: string,
    payload: Record<string, any>,
  ) => Promise<{ data: ConnectorEntity | null; error: string | null }>;
  update: (
    workspaceId: string,
    connectorId: string,
    payload: Record<string, any>,
  ) => Promise<{ data: ConnectorEntity | null; error: string | null }>;
  delete: (
    workspaceId: string,
    connectorId: string,
  ) => Promise<{ success: boolean; error: string | null }>;
}

function makeKey(workspaceId: string, connectorId: string) {
  return `${workspaceId}:${connectorId}`;
}

export const useConnectorEntitiesStore = create<EntitiesState>()(
  immer((set, get) => ({
    entities: {},
    loading: {},
    fetchOne: async (workspaceId, connectorId) => {
      const key = makeKey(workspaceId, connectorId);
      let entity: ConnectorEntity | undefined;
      set(state => {
        entity = state.entities[key];
        if (!entity) state.loading[key] = true;
      });
      if (entity) return entity;
      try {
        const data = await apiClient.get<{
          success: boolean;
          data: any;
        }>(`/workspaces/${workspaceId}/connectors/${connectorId}`);
        if (data.success) {
          set(state => {
            state.entities[key] = { ...(data as any).data, workspaceId };
            delete state.loading[key];
          });
          return (data as any).data;
        }
      } catch (err) {
        console.error("Failed to fetch connector", err);
      } finally {
        set(state => {
          delete state.loading[key];
        });
      }
      return null;
    },
    fetchAll: async workspaceId => {
      set(state => {
        state.loading[workspaceId] = true;
      });

      try {
        const data = await apiClient.get<{
          success: boolean;
          data: any[];
        }>(`/workspaces/${workspaceId}/connectors`);
        if (data.success) {
          set(state => {
            (data as any).data.forEach((ds: any) => {
              const key = makeKey(workspaceId, ds._id);
              state.entities[key] = { ...ds, workspaceId };
            });
          });
          return (data as any).data;
        }
      } catch (err) {
        console.error("Failed to fetch connectors list", err);
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
    remove: (workspaceId, connectorId) =>
      set(state => {
        const key = makeKey(workspaceId, connectorId);
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
    ): Promise<{ data: ConnectorEntity | null; error: string | null }> => {
      try {
        const data = await apiClient.post<{
          success: boolean;
          data: any;
        }>(`/workspaces/${workspaceId}/connectors`, payload);
        if (data.success) {
          const entity = {
            ...(data as any).data,
            workspaceId,
          } as ConnectorEntity;
          set(state => {
            const key = makeKey(workspaceId, entity._id);
            state.entities[key] = entity;
          });
          return { data: entity, error: null };
        }
        return { data: null, error: (data as any).error || "Failed to create" };
      } catch (err: any) {
        console.error("Create connector failed", err);
        return {
          data: null,
          error: err?.message || "Failed to create",
        };
      }
    },
    update: async (
      workspaceId: string,
      connectorId: string,
      payload: Record<string, any>,
    ): Promise<{ data: ConnectorEntity | null; error: string | null }> => {
      try {
        const data = await apiClient.put<{
          success: boolean;
          data: any;
        }>(`/workspaces/${workspaceId}/connectors/${connectorId}`, payload);
        if (data.success) {
          const entity = {
            ...(data as any).data,
            workspaceId,
          } as ConnectorEntity;
          set(state => {
            const key = makeKey(workspaceId, entity._id);
            state.entities[key] = entity;
          });
          return { data: entity, error: null };
        }
        return { data: null, error: (data as any).error || "Failed to update" };
      } catch (err: any) {
        console.error("Update connector failed", err);
        return {
          data: null,
          error: err?.message || "Failed to update",
        };
      }
    },
    delete: async (
      workspaceId: string,
      connectorId: string,
    ): Promise<{ success: boolean; error: string | null }> => {
      try {
        const data = await apiClient.delete<{
          success: boolean;
          error?: string;
        }>(`/workspaces/${workspaceId}/connectors/${connectorId}`);
        if (data.success) {
          set(state => {
            const key = makeKey(workspaceId, connectorId);
            delete state.entities[key];
          });
          return { success: true, error: null };
        }
        return {
          success: false,
          error: (data as any).error || "Failed to delete",
        };
      } catch (err: any) {
        console.error("Delete connector failed", err);
        return {
          success: false,
          error: err?.message || "Failed to delete",
        };
      }
    },
  })),
);
