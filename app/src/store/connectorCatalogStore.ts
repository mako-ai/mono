import { create } from "zustand";
import { persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

export interface ConnectorType {
  type: string;
  name: string;
  version: string;
  description: string;
  supportedEntities: string[];
}

export interface ConnectorSchemaResponse {
  fields: Array<any>;
}

interface CatalogState {
  types: ConnectorType[] | null;
  loading: boolean;
  error: string | null;
  schemas: Record<string, ConnectorSchemaResponse>;
  schemaLoading: Record<string, boolean>;
  /** Fetch types once unless force=true */
  fetchCatalog: (workspaceId: string, force?: boolean) => Promise<void>;
  /** Fetch schema for connector type */
  fetchSchema: (
    type: string,
    force?: boolean,
  ) => Promise<ConnectorSchemaResponse | null>;
}

export const useConnectorCatalogStore = create<CatalogState>()(
  persist(
    immer((set, get) => ({
      types: null,
      loading: false,
      error: null,
      schemas: {},
      schemaLoading: {},
      fetchCatalog: async (workspaceId: string, force = false) => {
        set(state => {
          if (state.types && !force) return; // already fetched
          state.loading = true;
          state.error = null;
        });
        try {
          const response = await fetch(
            `/api/workspaces/${workspaceId}/sources/connectors/types`,
          );
          const data = await response.json();
          if (data.success) {
            set(state => {
              state.types = data.data;
              state.loading = false;
            });
          } else {
            set(state => {
              state.error = data.error || "Failed to load connector types";
              state.loading = false;
            });
          }
        } catch (err: any) {
          set(state => {
            state.error = err.message || "Failed to load connector types";
            state.loading = false;
          });
        }
      },
      fetchSchema: async (type: string, force = false) => {
        const stateSnapshot = get();
        if (stateSnapshot.schemas[type] && !force) {
          return stateSnapshot.schemas[type];
        }
        if (stateSnapshot.schemaLoading[type]) return null;

        set(state => {
          state.schemaLoading[type] = true;
        });

        try {
          const res = await fetch(`/api/connectors/${type}/schema`);
          const json = await res.json();
          if (res.ok && json.success) {
            set(state => {
              state.schemas[type] = json.data;
              delete state.schemaLoading[type];
            });
            return json.data;
          }
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error("Failed to fetch schema", err);
        } finally {
          set(state => {
            delete state.schemaLoading[type];
          });
        }
        return null;
      },
    })),
    {
      name: "connector-catalog-store",
      version: 1,
      partialize: state => ({ types: state.types, schemas: state.schemas }),
    },
  ),
);
