import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { persist } from "zustand/middleware";

export interface ConnectorDraft {
  tabId: string;
  values: Record<string, any>;
  isDirty: boolean;
}

interface ConnectorState {
  drafts: Record<string, ConnectorDraft>;
  /**
   * Upsert (create or update) the draft for the given tab.
   */
  upsertDraft: (tabId: string, values: Record<string, any>) => void;
  /**
   * Remove the draft associated with the given tab.
   */
  deleteDraft: (tabId: string) => void;
  /**
   * Remove every stored draft (used during logout, etc.).
   */
  clearDrafts: () => void;
}

export const useConnectorStore = create<ConnectorState>()(
  persist(
    immer(set => ({
      drafts: {},
      upsertDraft: (tabId, values) =>
        set(state => {
          state.drafts[tabId] = {
            tabId,
            values,
            isDirty: true,
          };
        }),
      deleteDraft: tabId =>
        set(state => {
          delete state.drafts[tabId];
        }),
      clearDrafts: () =>
        set(state => {
          state.drafts = {};
        }),
    })),
    {
      name: "connector-draft-store",
      version: 1,
    },
  ),
);
