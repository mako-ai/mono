import { useEffect, useState } from "react";
import {
  Box,
  Typography,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  CircularProgress,
  Tooltip,
  Alert,
} from "@mui/material";
import { Add as AddIcon, Refresh as RefreshIcon } from "@mui/icons-material";

import { useWorkspace } from "../contexts/workspace-context";
import { useConsoleStore } from "../store/consoleStore";

interface DataSource {
  _id: string;
  name: string;
  description?: string;
  type: string;
  isActive: boolean;
}

function DataSourceExplorer() {
  const { currentWorkspace } = useWorkspace();
  const { consoleTabs, addConsoleTab, setActiveConsole } = useConsoleStore();

  const [sources, setSources] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSources = async () => {
    if (!currentWorkspace) return;
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(
        `/api/workspaces/${currentWorkspace.id}/sources`,
      );
      const data = await response.json();
      if (data.success) {
        setSources(data.data);
      } else {
        setError(data.error || "Failed to fetch data sources");
      }
    } catch (err) {
      console.error("Error fetching data sources", err);
      setError("Failed to fetch data sources");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSources();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWorkspace]);

  const openTabForSource = (source?: DataSource) => {
    // Use source id as tab content (unique) or empty string for new
    const contentKey = source?._id || "";
    // Check if a tab with this content already exists
    const existing = consoleTabs.find(
      t => t.kind === "sources" && t.content === contentKey,
    );
    if (existing) {
      setActiveConsole(existing.id);
      return;
    }

    const id = addConsoleTab({
      title: source ? source.name : "New Data Source",
      content: contentKey,
      initialContent: contentKey,
      kind: "sources",
    });
    setActiveConsole(id);
  };

  const handleAdd = () => openTabForSource(undefined);

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <Box sx={{ px: 1, py: 0.5, borderBottom: 1, borderColor: "divider" }}>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Typography variant="h6">Data Sources</Typography>
          <Box sx={{ display: "flex", gap: 0.5 }}>
            <Tooltip title="Add Data Source">
              <IconButton size="small" onClick={handleAdd}>
                <AddIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Refresh">
              <IconButton size="small" onClick={fetchSources}>
                <RefreshIcon />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
      </Box>

      {/* List */}
      <Box sx={{ flexGrow: 1, overflow: "auto" }}>
        {loading ? (
          <Box sx={{ p: 2, textAlign: "center" }}>
            <CircularProgress size={24} />
          </Box>
        ) : error ? (
          <Box sx={{ p: 2 }}>
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          </Box>
        ) : sources.length === 0 ? (
          <Box sx={{ p: 3, textAlign: "center", color: "text.secondary" }}>
            <Typography variant="body2">No data sources configured.</Typography>
          </Box>
        ) : (
          <List dense>
            {sources.map(src => (
              <ListItem key={src._id} disablePadding>
                <ListItemButton onClick={() => openTabForSource(src)}>
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <Box
                      component="img"
                      src={`/api/connectors/${src.type}/icon.svg`}
                      alt={`${src.type} icon`}
                      sx={{ width: 24, height: 24 }}
                    />
                  </ListItemIcon>
                  <ListItemText primary={src.name} />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        )}
      </Box>
    </Box>
  );
}

export default DataSourceExplorer;
