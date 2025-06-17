import { useEffect, useState, useCallback, useRef } from "react";
import { Box, CircularProgress } from "@mui/material";
import DataSourceForm from "./DataSourceForm";
import { useWorkspace } from "../contexts/workspace-context";
import { useConsoleStore } from "../store/consoleStore";
import { useConnectorCatalogStore } from "../store/connectorCatalogStore";
import { useDataSourceEntitiesStore } from "../store/dataSourceEntitiesStore";
import { useDataSourceStore } from "../store/dataSourceStore";

interface ConnectorType {
  type: string;
  name: string;
  version: string;
  description: string;
  supportedEntities: string[];
}

interface DataSourceTabProps {
  /**
   * The id of the data source being edited. If undefined/empty -> create new.
   */
  sourceId?: string;
  /** Console tab id so we can close/update title */
  tabId: string;
}

const DataSourceTab: React.FC<DataSourceTabProps> = ({
  sourceId: initialSourceId,
  tabId,
}) => {
  const { currentWorkspace } = useWorkspace();
  const {
    removeConsoleTab,
    updateConsoleTitle,
    updateConsoleIcon,
    updateConsoleContent,
    consoleTabs,
    updateConsoleDirty,
  } = useConsoleStore();

  // Draft store
  const deleteDraft = useDataSourceStore(state => state.deleteDraft);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* ------------------ global catalog ------------------ */
  const { types: connectorTypes, fetchCatalog } = useConnectorCatalogStore();

  /* ------------------ entity cache -------------------- */
  const {
    fetchOne: fetchSource,
    upsert: upsertSource,
    entities,
  } = useDataSourceEntitiesStore();

  const [localSourceId, setLocalSourceId] = useState<string | undefined>(
    initialSourceId,
  );
  const effectiveSourceId = localSourceId;
  const dataSourceKey =
    currentWorkspace && effectiveSourceId
      ? `${currentWorkspace.id}:${effectiveSourceId}`
      : null;
  const dataSource = dataSourceKey ? (entities as any)[dataSourceKey] : null;

  const updateConsoleTitleRef = useRef(updateConsoleTitle);
  const consoleTabsRef = useRef(consoleTabs);

  // keep refs in sync
  useEffect(() => {
    updateConsoleTitleRef.current = updateConsoleTitle;
  });
  useEffect(() => {
    consoleTabsRef.current = consoleTabs;
  }, [consoleTabs]);

  // Helper to update the tab icon based on connector type
  const updateTabIcon = useCallback(
    (type: string) => {
      updateConsoleIcon(tabId, `/api/connectors/${type}/icon.svg`);
    },
    [updateConsoleIcon, tabId],
  );

  /* ------------------ effects ------------------ */
  // Fetch global connector catalog once
  useEffect(() => {
    if (!currentWorkspace || connectorTypes) return;
    fetchCatalog(currentWorkspace.id);
  }, [currentWorkspace, connectorTypes, fetchCatalog]);

  // Fetch data source entity if needed
  useEffect(() => {
    if (!currentWorkspace || !effectiveSourceId) return;
    if (dataSource) {
      // ensure title/icon update once entity arrives
      updateConsoleTitleRef.current(tabId, dataSource.name || "Data Source");
      updateTabIcon(dataSource.type);
      setError(null);
      return;
    }
    setLoading(true);
    fetchSource(currentWorkspace.id, effectiveSourceId).then(entity => {
      if (entity) {
        updateConsoleTitleRef.current(tabId, entity.name || "Data Source");
        updateTabIcon(entity.type);
        setError(null);
      } else {
        setError("Failed to load data source");
      }
      setLoading(false);
    });
  }, [
    currentWorkspace,
    effectiveSourceId,
    dataSource,
    fetchSource,
    tabId,
    updateTabIcon,
  ]);

  /* ------------------ handlers ------------------ */
  const handleClose = () => {
    deleteDraft(tabId);
    removeConsoleTab(tabId);
  };

  const handleSubmit = async (formData: any) => {
    if (!currentWorkspace) return;

    try {
      const url = effectiveSourceId
        ? `/api/workspaces/${currentWorkspace.id}/sources/${effectiveSourceId}`
        : `/api/workspaces/${currentWorkspace.id}/sources`;
      const method = effectiveSourceId ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await response.json();
      if (data.success) {
        // update entity cache
        if (currentWorkspace) {
          upsertSource({ ...data.data, workspaceId: currentWorkspace.id });
        }
        setError(null);
        updateTabIcon(data.data.type);

        // Clear draft on successful save
        deleteDraft(tabId);

        const newId = data.data._id;
        if (!effectiveSourceId && newId) {
          // Persist the newly created data source id as the tab's content
          // Using the store action avoids mutating immutable state directly
          updateConsoleContent(tabId, newId);
          setLocalSourceId(newId);
        }
      } else {
        const serverError = data.error || data.message || JSON.stringify(data);
        setError(serverError);
      }
    } catch (err: any) {
      console.error("Error saving data source", err);
      setError(err.message || "Failed to save data source");
    }
  };

  /* ------------------ render -------------------- */
  if (loading) {
    return (
      <Box sx={{ p: 3, textAlign: "center" }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box
      sx={{
        height: "100%",
        p: 1,
        overflow: "auto",
        bgcolor: "background.paper",
      }}
    >
      <DataSourceForm
        variant="inline"
        tabId={tabId}
        onClose={handleClose}
        onSubmit={handleSubmit}
        dataSource={dataSource}
        connectorTypes={connectorTypes || []}
        errorMessage={error}
        onDirtyChange={dirty => updateConsoleDirty(tabId, dirty)}
        onTitleChange={title =>
          updateConsoleTitle(tabId, title || "New Data Source")
        }
      />
    </Box>
  );
};

export default DataSourceTab;
