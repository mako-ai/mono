import { create } from "zustand";

export type AppView =
  | "consoles"
  | "sources"
  | "databases"
  | "views"
  | "settings";

interface EditorContent {
  content: string;
  fileName?: string;
  language?: string;
}

interface AppState {
  activeView: AppView;
  setActiveView: (view: AppView) => void;
  activeEditorContent: EditorContent | undefined;
  setActiveEditorContent: (content: EditorContent | undefined) => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeView: "consoles", // Default view
  setActiveView: (view) => set({ activeView: view }),
  activeEditorContent: undefined,
  setActiveEditorContent: (content) => set({ activeEditorContent: content }),
}));
