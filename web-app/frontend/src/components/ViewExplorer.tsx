import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  CircularProgress,
  Alert,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  Collapse,
} from "@mui/material";
import {
  VisibilityOutlined as ViewIcon,
  Refresh as RefreshIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  FolderOutlined,
  ExpandLess,
  ExpandMore,
} from "@mui/icons-material";

interface ViewInfo {
  name: string;
  type: string;
  options: {
    viewOn?: string;
    pipeline?: any[];
  };
  info: any;
}

interface ViewExplorerProps {
  onViewSelect: (viewName: string, viewDefinition: any) => void;
  selectedView?: string;
  onCreateNew?: () => void;
}

const ViewExplorer: React.FC<ViewExplorerProps> = ({
  onViewSelect,
  selectedView,
  onCreateNew,
}) => {
  const [views, setViews] = useState<ViewInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    viewName: string | null;
  }>({ open: false, viewName: null });
  const [deleting, setDeleting] = useState(false);
  const [expandedCollections, setExpandedCollections] = useState<Set<string>>(
    new Set()
  );

  useEffect(() => {
    fetchViews();
  }, []);

  const fetchViews = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch("/api/database/views");
      const data = await response.json();

      if (data.success) {
        console.log("Raw views data from API:", data.data); // Debug log
        setViews(data.data);

        // Auto-expand all collections by default
        const collections = new Set<string>();
        data.data.forEach((view: ViewInfo) => {
          const collection = view.options.viewOn || "Unknown Collection";
          collections.add(collection);
        });
        setExpandedCollections(collections);
      } else {
        setError(data.error || "Failed to fetch views");
      }
    } catch (err) {
      setError("Failed to connect to the database API");
      console.error("Error fetching views:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleViewClick = (view: ViewInfo) => {
    console.log("Selected view:", view); // Debug log

    // Ensure the parent collection is expanded
    const collection = view.options.viewOn || "Unknown Collection";
    const newExpanded = new Set(expandedCollections);
    newExpanded.add(collection);
    setExpandedCollections(newExpanded);

    const viewDefinition = {
      name: view.name,
      viewOn: view.options.viewOn,
      pipeline: view.options.pipeline || [],
    };

    console.log("Parsed view definition:", viewDefinition); // Debug log
    onViewSelect(view.name, viewDefinition);
  };

  const handleRefresh = () => {
    fetchViews();
  };

  const handleCollectionToggle = (collectionName: string) => {
    const newExpanded = new Set(expandedCollections);
    if (newExpanded.has(collectionName)) {
      newExpanded.delete(collectionName);
    } else {
      newExpanded.add(collectionName);
    }
    setExpandedCollections(newExpanded);
  };

  const groupViewsByCollection = () => {
    const grouped: { [key: string]: ViewInfo[] } = {};

    views.forEach((view) => {
      const collection = view.options.viewOn || "Unknown Collection";
      if (!grouped[collection]) {
        grouped[collection] = [];
      }
      grouped[collection].push(view);
    });

    return grouped;
  };

  const handleDeleteClick = (viewName: string, event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent view selection
    setDeleteDialog({ open: true, viewName });
  };

  const handleDeleteCancel = () => {
    setDeleteDialog({ open: false, viewName: null });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteDialog.viewName) return;

    try {
      setDeleting(true);
      setError(null);

      const response = await fetch(
        `/api/database/views/${deleteDialog.viewName}`,
        {
          method: "DELETE",
        }
      );

      const data = await response.json();

      if (data.success) {
        // Remove the deleted view from the list
        setViews((prevViews) =>
          prevViews.filter((view) => view.name !== deleteDialog.viewName)
        );

        // If the deleted view was selected, clear the selection
        if (selectedView === deleteDialog.viewName) {
          onViewSelect("", null);
        }
      } else {
        setError(data.error || "Failed to delete view");
      }
    } catch (err) {
      setError("Failed to delete view");
      console.error("Error deleting view:", err);
    } finally {
      setDeleting(false);
      setDeleteDialog({ open: false, viewName: null });
    }
  };

  if (loading) {
    return (
      <Box
        sx={{
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <CircularProgress size={24} />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
        <Box sx={{ textAlign: "center" }}>
          <IconButton onClick={handleRefresh} color="primary">
            <RefreshIcon />
          </IconButton>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <Box sx={{ p: 1, borderBottom: 1, borderColor: "divider" }}>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Box>
            <Typography variant="h6">Database Views</Typography>
            <Typography variant="body2" color="text.secondary">
              {views.length} view{views.length !== 1 ? "s" : ""} found
            </Typography>
          </Box>
          <Box>
            <IconButton size="small" onClick={onCreateNew}>
              <AddIcon />
            </IconButton>
            <IconButton size="small" onClick={handleRefresh} color="primary">
              <RefreshIcon />
            </IconButton>
          </Box>
        </Box>
      </Box>

      <Box sx={{ flexGrow: 1, overflow: "auto" }}>
        {views.length === 0 ? (
          <Box
            sx={{
              p: 3,
              textAlign: "center",
              color: "text.secondary",
            }}
          >
            <Typography variant="body2">
              No views found in the database
            </Typography>
          </Box>
        ) : (
          <List dense>
            {(() => {
              const groupedViews = groupViewsByCollection();
              const collections = Object.keys(groupedViews).sort();

              return collections.map((collection) => {
                const isExpanded = expandedCollections.has(collection);
                const collectionViews = groupedViews[collection];

                return (
                  <React.Fragment key={collection}>
                    {/* Collection Folder */}
                    <ListItem disablePadding>
                      <ListItemButton
                        onClick={() => handleCollectionToggle(collection)}
                        sx={{ py: 0.5, pl: 1 }}
                      >
                        <ListItemIcon sx={{ minWidth: 32 }}>
                          <FolderOutlined />
                        </ListItemIcon>
                        <ListItemText
                          primary={collection}
                          sx={{
                            "& .MuiListItemText-primary": {
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            },
                          }}
                        />
                        {isExpanded ? <ExpandLess /> : <ExpandMore />}
                      </ListItemButton>
                    </ListItem>

                    {/* Views under this collection */}
                    <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                      {collectionViews.map((view) => (
                        <ListItem key={view.name} disablePadding>
                          <ListItemButton
                            selected={selectedView === view.name}
                            onClick={() => handleViewClick(view)}
                            sx={{ py: 0.5, pl: 3 }} // Indented for hierarchy
                          >
                            <ListItemIcon sx={{ minWidth: 32 }}>
                              <ViewIcon />
                            </ListItemIcon>
                            <ListItemText
                              primary={view.name}
                              sx={{
                                "& .MuiListItemText-primary": {
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                },
                              }}
                            />
                          </ListItemButton>
                          <IconButton
                            size="small"
                            onClick={(e) => handleDeleteClick(view.name, e)}
                            sx={{
                              ml: 1,
                              mr: 1,
                              color: "text.secondary",
                              "&:hover": {
                                color: "error.main",
                              },
                            }}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </ListItem>
                      ))}
                    </Collapse>
                  </React.Fragment>
                );
              });
            })()}
          </List>
        )}
      </Box>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialog.open}
        onClose={handleDeleteCancel}
        aria-labelledby="delete-dialog-title"
        aria-describedby="delete-dialog-description"
      >
        <DialogTitle id="delete-dialog-title">Delete View</DialogTitle>
        <DialogContent>
          <DialogContentText id="delete-dialog-description">
            Are you sure you want to delete the view "{deleteDialog.viewName}"?
            This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteCancel} disabled={deleting}>
            Cancel
          </Button>
          <Button
            onClick={handleDeleteConfirm}
            color="error"
            variant="contained"
            disabled={deleting}
          >
            {deleting ? "Deleting..." : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ViewExplorer;
