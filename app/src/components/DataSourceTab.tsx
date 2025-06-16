import { useEffect, useState, useCallback, useRef } from "react";
import { Box, CircularProgress, Alert } from "@mui/material";
import DataSourceForm from "./DataSourceForm";
import { useWorkspace } from "../contexts/workspace-context";
import { useConsoleStore } from "../store/consoleStore";

interface DataSource {
  _id?: string;
  name: string;
  description?: string;
  type: string;
  isActive: boolean;
  config: Record<string, any>;
  settings: Record<string, any>;
  targetDatabases?: string[];
}

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

const DataSourceTab: React.FC<DataSourceTabProps> = ({ sourceId, tabId }) => {
  const { currentWorkspace } = useWorkspace();
  const { removeConsoleTab, updateConsoleTitle, consoleTabs } =
    useConsoleStore();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dataSource, setDataSource] = useState<any>(null);
  const [connectorTypes, setConnectorTypes] = useState<ConnectorType[]>([]);

  const fetchConnectorTypes = useCallback(async () => {
    if (!currentWorkspace) return;
    try {
      const response = await fetch(
        `/api/workspaces/${currentWorkspace.id}/sources/connectors/types`,
      );
      const data = await response.json();
      if (data.success) {
        setConnectorTypes(data.data);
      }
    } catch (err) {
      console.error("Error fetching connector types", err);
    }
  }, [currentWorkspace]);

  const updateConsoleTitleRef = useRef(updateConsoleTitle);
  const consoleTabsRef = useRef(consoleTabs);

  // keep refs in sync
  useEffect(() => {
    updateConsoleTitleRef.current = updateConsoleTitle;
  });
  useEffect(() => {
    consoleTabsRef.current = consoleTabs;
  }, [consoleTabs]);

  const fetchDataSource = useCallback(async () => {
    if (!currentWorkspace || !sourceId) return;

    try {
      setLoading(true);
      const response = await fetch(
        `/api/workspaces/${currentWorkspace.id}/sources/${sourceId}`,
      );
      const data = await response.json();
      if (response.ok && data.success) {
        setDataSource(data.data);
        // Update console tab title (via ref to avoid changing deps)
        updateConsoleTitleRef.current(tabId, data.data.name || "Data Source");
        setError(null);
      } else {
        const serverError = data.error || data.message || JSON.stringify(data);
        setError(serverError);
      }
    } catch (err: any) {
      console.error("Error loading data source", err);
      setError(err.message || "Failed to load data source");
    } finally {
      setLoading(false);
    }
  }, [currentWorkspace, sourceId, tabId]);

  // Prevent duplicate calls in React StrictMode by tracking last fetched keys
  const lastTypesWorkspaceId = useRef<string | null>(null);
  const lastSourceKey = useRef<string | null>(null);

  useEffect(() => {
    if (!currentWorkspace) return;

    if (lastTypesWorkspaceId.current !== currentWorkspace.id) {
      lastTypesWorkspaceId.current = currentWorkspace.id;
      fetchConnectorTypes();
    }
  }, [currentWorkspace, fetchConnectorTypes]);

  useEffect(() => {
    if (!currentWorkspace || !sourceId) return;

    const key = `${currentWorkspace.id}-${sourceId}`;
    if (lastSourceKey.current !== key) {
      lastSourceKey.current = key;
      fetchDataSource();
    }
  }, [currentWorkspace, sourceId, fetchDataSource]);

  /* ------------------ handlers ------------------ */
  const handleClose = () => {
    removeConsoleTab(tabId);
  };

  const handleSubmit = async (formData: any) => {
    if (!currentWorkspace) return;

    try {
      const url = sourceId
        ? `/api/workspaces/${currentWorkspace.id}/sources/${sourceId}`
        : `/api/workspaces/${currentWorkspace.id}/sources`;
      const method = sourceId ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await response.json();
      if (data.success) {
        setDataSource(data.data);
        // Update console tab title if name changed or new created
        updateConsoleTitle(tabId, data.data.name || "New Data Source");
        // If this was a create, we should also update the tab's content to hold the new id
        const newId = data.data._id;
        if (!sourceId && newId) {
          const tab = consoleTabs.find(t => t.id === tabId);
          if (tab) {
            tab.content = newId;
          }
        }
        setError(null);
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
        onClose={handleClose}
        onSubmit={handleSubmit}
        dataSource={dataSource}
        connectorTypes={connectorTypes}
        errorMessage={error}
      />
    </Box>
  );
};

export default DataSourceTab;
