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
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
} from "@mui/material";
import {
  Add as AddIcon,
  Refresh as RefreshIcon,
  Delete as DeleteIcon,
} from "@mui/icons-material";

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

  // Context-menu & delete handling state
  const [contextMenu, setContextMenu] = useState<{
    mouseX: number;
    mouseY: number;
    item: DataSource;
  } | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<DataSource | null>(null);

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
    // If editing an existing source, try to reuse an open tab; for a new source always open a fresh tab
    if (source) {
      const contentKey = source._id;
      const existing = consoleTabs.find(
        t => t.kind === "sources" && t.content === contentKey,
      );
      if (existing) {
        setActiveConsole(existing.id);
        return;
      }

      const id = addConsoleTab({
        title: source.name,
        content: contentKey,
        initialContent: contentKey,
        kind: "sources",
      });
      setActiveConsole(id);
    } else {
      // Always create a new tab for a brand-new data source form
      const id = addConsoleTab({
        title: "New Data Source",
        content: "", // will be populated after save
        initialContent: "",
        kind: "sources",
      });
      setActiveConsole(id);
    }
  };

  const handleAdd = () => openTabForSource(undefined);

  // ---------- Context menu helpers ----------
  const handleContextMenu = (
    event: React.MouseEvent<HTMLDivElement, MouseEvent>,
    item: DataSource,
  ) => {
    event.preventDefault();
    setContextMenu({
      mouseX: event.clientX + 2,
      mouseY: event.clientY - 6,
      item,
    });
  };

  const handleContextMenuClose = () => setContextMenu(null);

  const handleDelete = (item: DataSource) => {
    setSelectedItem(item);
    setDeleteDialogOpen(true);
    handleContextMenuClose();
  };

  const handleDeleteConfirm = async () => {
    if (!currentWorkspace || !selectedItem) return;
    try {
      const response = await fetch(
        `/api/workspaces/${currentWorkspace.id}/sources/${selectedItem._id}`,
        {
          method: "DELETE",
        },
      );
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      if (data.success) {
        setDeleteDialogOpen(false);
        setSelectedItem(null);
        fetchSources();
      } else {
        console.error("Failed to delete data source:", data.error);
      }
    } catch (e: any) {
      console.error("Failed to delete data source:", e);
    }
  };

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <Box sx={{ px: 1, py: 0.25, borderBottom: 1, borderColor: "divider" }}>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Typography
            variant="h6"
            sx={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            Data Sources
          </Typography>
          <Box sx={{ display: "flex" }}>
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
                <ListItemButton
                  onClick={() => openTabForSource(src)}
                  onContextMenu={e => handleContextMenu(e, src)}
                >
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

      {/* Context Menu */}
      <Menu
        open={contextMenu !== null}
        onClose={handleContextMenuClose}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenu !== null
            ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
            : undefined
        }
      >
        <MenuItem onClick={() => handleDelete(contextMenu!.item)}>
          <DeleteIcon sx={{ mr: 1 }} fontSize="small" />
          Delete
        </MenuItem>
      </Menu>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Delete Data Source</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            This will permanently delete the data source.
          </Alert>
          <Typography>
            Are you sure you want to delete "{selectedItem?.name}"?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleDeleteConfirm}
            color="error"
            variant="contained"
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default DataSourceExplorer;
