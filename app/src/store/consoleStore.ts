import { useAppStore, useAppDispatch } from "./appStore";
import { ConsoleTab } from "./appStore";

export type TabKind = "console" | "settings" | "sources";

// Selector helpers
const selectConsoleState = (state: any) => state.consoles;

export const useConsoleStore = () => {
  const dispatch = useAppDispatch();
  const { tabs, activeTabId } = useAppStore(selectConsoleState);

  // Helper: convert Record to array for backward compatibility
  const consoleTabs: ConsoleTab[] = Object.values(tabs);

  const addConsoleTab = (tab: Omit<ConsoleTab, "id">): string => {
    const id = Date.now().toString() + Math.random();
    dispatch({
      type: "OPEN_CONSOLE_TAB",
      payload: {
        id,
        title: tab.title,
        content: tab.content || tab.initialContent,
        initialContent: tab.initialContent,
        databaseId: tab.databaseId,
        filePath: tab.filePath,
        kind: (tab as any).kind || "console",
      },
    } as any);
    return id;
  };

  const removeConsoleTab = (id: string) =>
    dispatch({ type: "CLOSE_CONSOLE_TAB", payload: { id } } as any);

  const setActiveConsole = (id: string | null) =>
    dispatch({ type: "FOCUS_CONSOLE_TAB", payload: { id } } as any);

  const updateConsoleContent = (id: string, content: string) =>
    dispatch({
      type: "UPDATE_CONSOLE_CONTENT",
      payload: { id, content },
    } as any);

  const findTabByKind = (kind: TabKind) =>
    consoleTabs.find((t: any) => (t as any).kind === kind);

  const updateConsoleDatabase = (id: string, databaseId: string) => {
    // We don't store databaseId separately yet – add a quick in-place update
    const tab = tabs[id];
    if (tab) {
      dispatch({
        type: "UPDATE_CONSOLE_CONTENT",
        payload: { id, content: tab.content },
      } as any);
      // Extend reducer later for dedicated action
    }
  };
  const updateConsoleFilePath = (id: string, filePath: string) => {
    // Not fully implemented
  };
  const updateConsoleTitle = (id: string, title: string) => {
    dispatch({
      type: "UPDATE_CONSOLE_TITLE",
      payload: { id, title },
    });
  };

  const updateConsoleDirty = (id: string, isDirty: boolean) => {
    dispatch({
      type: "UPDATE_CONSOLE_DIRTY",
      payload: { id, isDirty },
    });
  };

  const clearAllConsoles = () => {
    consoleTabs.forEach((tab) => removeConsoleTab(tab.id));
  };

  return {
    consoleTabs,
    activeConsoleId: activeTabId,
    addConsoleTab,
    findTabByKind,
    removeConsoleTab,
    updateConsoleContent,
    setActiveConsole,
    clearAllConsoles,
    updateConsoleDatabase,
    updateConsoleFilePath,
    updateConsoleTitle,
    updateConsoleDirty,
  };
};

// Provide getState for legacy direct access
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore – attach property dynamically
useConsoleStore.getState = () => {
  const global = useAppStore.getState();
  const dispatch = global.dispatch;
  const tabs = global.consoles.tabs;
  const activeTabId = global.consoles.activeTabId;

  const consoleTabs: ConsoleTab[] = Object.values(tabs);

  const addConsoleTab = (tab: Omit<ConsoleTab, "id">): string => {
    const id = Date.now().toString() + Math.random();
    dispatch({
      type: "OPEN_CONSOLE_TAB",
      payload: {
        id,
        title: tab.title,
        content: tab.content || tab.initialContent,
        initialContent: tab.initialContent,
        databaseId: tab.databaseId,
        filePath: tab.filePath,
        kind: (tab as any).kind || "console",
      },
    });
    return id;
  };

  const removeConsoleTab = (id: string) =>
    dispatch({ type: "CLOSE_CONSOLE_TAB", payload: { id } });

  const setActiveConsole = (id: string | null) =>
    dispatch({ type: "FOCUS_CONSOLE_TAB", payload: { id } });

  const updateConsoleContent = (id: string, content: string) =>
    dispatch({
      type: "UPDATE_CONSOLE_CONTENT",
      payload: { id, content },
    });

  const findTabByKind = (kind: TabKind) =>
    consoleTabs.find((t: any) => (t as any).kind === kind);

  const updateConsoleDatabase = (id: string, databaseId: string) => {
    // Not fully implemented
  };
  const updateConsoleFilePath = (id: string, filePath: string) => {
    // Not fully implemented
  };
  const updateConsoleTitle = (id: string, title: string) => {
    dispatch({
      type: "UPDATE_CONSOLE_TITLE",
      payload: { id, title },
    });
  };

  const updateConsoleDirty = (id: string, isDirty: boolean) => {
    dispatch({
      type: "UPDATE_CONSOLE_DIRTY",
      payload: { id, isDirty },
    });
  };

  const clearAllConsoles = () => {
    consoleTabs.forEach((tab) => removeConsoleTab(tab.id));
  };

  return {
    consoleTabs,
    activeConsoleId: activeTabId,
    addConsoleTab,
    findTabByKind,
    removeConsoleTab,
    updateConsoleContent,
    setActiveConsole,
    clearAllConsoles,
    updateConsoleDatabase,
    updateConsoleFilePath,
    updateConsoleTitle,
    updateConsoleDirty,
  };
};
