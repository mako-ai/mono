import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface ConsoleTab {
  id: string;
  title: string;
  content: string; // Current content of the console
  initialContent: string; // Initial content when created
}

interface ConsoleState {
  // Console tabs
  consoleTabs: ConsoleTab[];
  activeConsoleId: string | null;

  // Actions
  addConsoleTab: (tab: Omit<ConsoleTab, "id">) => string; // Returns the new tab ID
  removeConsoleTab: (id: string) => void;
  updateConsoleContent: (id: string, content: string) => void;
  setActiveConsole: (id: string | null) => void;
  clearAllConsoles: () => void;
}

export const useConsoleStore = create<ConsoleState>()(
  persist(
    (set, get) => ({
      // Console tabs
      consoleTabs: [],
      activeConsoleId: null,

      // Actions
      addConsoleTab: (tab) => {
        const id = Date.now().toString() + Math.random();
        const newTab: ConsoleTab = {
          id,
          title: tab.title,
          content: tab.content || tab.initialContent,
          initialContent: tab.initialContent,
        };

        set((state) => ({
          consoleTabs: [...state.consoleTabs, newTab],
          activeConsoleId: id,
        }));

        return id;
      },

      removeConsoleTab: (id) =>
        set((state) => {
          const filtered = state.consoleTabs.filter((tab) => tab.id !== id);
          const newActiveId =
            state.activeConsoleId === id
              ? filtered.length > 0
                ? filtered[0].id
                : null
              : state.activeConsoleId;

          return {
            consoleTabs: filtered,
            activeConsoleId: newActiveId,
          };
        }),

      updateConsoleContent: (id, content) =>
        set((state) => ({
          consoleTabs: state.consoleTabs.map((tab) =>
            tab.id === id ? { ...tab, content } : tab
          ),
        })),

      setActiveConsole: (id) => set({ activeConsoleId: id }),

      clearAllConsoles: () => set({ consoleTabs: [], activeConsoleId: null }),
    }),
    {
      name: "console-store", // unique name for localStorage key
    }
  )
);
