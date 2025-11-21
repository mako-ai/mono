import { useAppStore } from "./appStore";
import { useMemo } from "react";

export const useDatabaseExplorerStore = () => {
  const dispatch = useAppStore(s => s.dispatch);
  const expandedServersArray = useAppStore(
    s => s.explorers.database.expandedServers,
  );
  const expandedDatabasesArray = useAppStore(
    s => s.explorers.database.expandedDatabases,
  );
  const expandedCollectionGroupsArray = useAppStore(
    s => s.explorers.database.expandedCollectionGroups,
  );
  const expandedViewGroupsArray = useAppStore(
    s => s.explorers.database.expandedViewGroups,
  );
  const expandedNodesArray = useAppStore(
    s => s.explorers.database.expandedNodes,
  );

  const value = useMemo(() => {
    // Convert arrays to Sets for backward compatibility
    const expandedServers = new Set(expandedServersArray);
    const expandedDatabases = new Set(expandedDatabasesArray);
    const expandedCollectionGroups = new Set(expandedCollectionGroupsArray);
    const expandedViewGroups = new Set(expandedViewGroupsArray);
    const expandedNodes = new Set(expandedNodesArray);

    return {
      expandedServers,
      expandedDatabases,
      expandedCollectionGroups,
      expandedViewGroups,
      expandedNodes,

      // Actions
      toggleServer: (serverId: string) =>
        dispatch({
          type: "TOGGLE_DATABASE_SERVER",
          payload: { serverId },
        } as any),

      toggleDatabase: (databaseId: string) =>
        dispatch({
          type: "TOGGLE_DATABASE_DATABASE",
          payload: { databaseId },
        } as any),

      toggleCollectionGroup: (databaseId: string) =>
        dispatch({
          type: "TOGGLE_DATABASE_COLLECTION_GROUP",
          payload: { databaseId },
        } as any),

      toggleViewGroup: (databaseId: string) =>
        dispatch({
          type: "TOGGLE_DATABASE_VIEW_GROUP",
          payload: { databaseId },
        } as any),

      toggleNode: (nodeId: string) =>
        dispatch({
          type: "TOGGLE_DATABASE_NODE",
          payload: { nodeId },
        } as any),

      expandServer: (serverId: string) =>
        dispatch({
          type: "EXPAND_DATABASE_SERVER",
          payload: { serverId },
        } as any),

      expandDatabase: (databaseId: string) =>
        dispatch({
          type: "EXPAND_DATABASE_DATABASE",
          payload: { databaseId },
        } as any),

      // Helper methods to check expanded state
      isServerExpanded: (serverId: string) => expandedServers.has(serverId),
      isDatabaseExpanded: (databaseId: string) =>
        expandedDatabases.has(databaseId),
      isCollectionGroupExpanded: (databaseId: string) =>
        expandedCollectionGroups.has(databaseId),
      isViewGroupExpanded: (databaseId: string) =>
        expandedViewGroups.has(databaseId),
      isNodeExpanded: (nodeId: string) => expandedNodes.has(nodeId),
    };
  }, [
    dispatch,
    expandedServersArray,
    expandedDatabasesArray,
    expandedCollectionGroupsArray,
    expandedViewGroupsArray,
    expandedNodesArray,
  ]);

  return value;
};
