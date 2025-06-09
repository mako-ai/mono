import { useEffect, useState, forwardRef, useImperativeHandle } from "react";
import {
  Box,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Collapse,
  Typography,
  IconButton,
  Skeleton,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Tooltip,
  Alert,
} from "@mui/material";
import {
  FolderOutlined as FolderIcon,
  ExpandMore as ExpandMoreIcon,
  ChevronRight as ChevronRightIcon,
  Refresh as RefreshIcon,
  Add as AddIcon,
  CreateNewFolder as CreateFolderIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
} from "@mui/icons-material";
import { SquareTerminal as ConsoleIcon } from "lucide-react";
import { useAppStore } from "../store/appStore";
import { useWorkspace } from "../contexts/workspace-context";

interface ConsoleEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: ConsoleEntry[];
  content?: string; // Added to match potential server object, though not used in rendering tree directly
  id?: string; // Database ID for saved consoles/folders
  folderId?: string; // Database ID for folders
  databaseId?: string; // Associated database ID
  language?: "sql" | "javascript" | "mongodb";
  description?: string;
  isPrivate?: boolean;
  lastExecutedAt?: Date;
  executionCount?: number;
}

interface ConsoleExplorerProps {
  onConsoleSelect: (path: string, content: string) => void;
}

export interface ConsoleExplorerRef {
  refresh: () => void;
}

const ConsoleExplorer = forwardRef<ConsoleExplorerRef, ConsoleExplorerProps>(
  (props, ref) => {
    const { onConsoleSelect } = props;
    const { currentWorkspace } = useWorkspace();
    const [consoleEntries, setConsoleEntries] = useState<ConsoleEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const dispatch = useAppStore((s) => s.dispatch);
    const expandedFoldersArray = useAppStore(
      (s) => s.explorers.console.expandedFolders
    );
    const expandedFolders = new Set(expandedFoldersArray);
    const [error, setError] = useState<string | null>(null);
    const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
    const [folderDialogOpen, setFolderDialogOpen] = useState(false);
    const [newFolderName, setNewFolderName] = useState("");
    const [selectedParentFolder, setSelectedParentFolder] = useState<
      string | null
    >(null);
    const [contextMenu, setContextMenu] = useState<{
      mouseX: number;
      mouseY: number;
      item: ConsoleEntry;
    } | null>(null);
    const [renameDialogOpen, setRenameDialogOpen] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState<ConsoleEntry | null>(null);
    const [newItemName, setNewItemName] = useState("");

    const fetchConsoleEntries = async () => {
      // Don't fetch if no workspace is selected
      if (!currentWorkspace) {
        setConsoleEntries([]);
        setError("No workspace selected");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/workspaces/${currentWorkspace.id}/consoles`
        );
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const rawText = await response.text();
        // console.log("Raw console tree response text:", rawText); // Kept for potential future debugging

        const data = JSON.parse(rawText);
        // console.log("Full Response Parse - data object:", data);

        if (data.tree && Array.isArray(data.tree)) {
          const parsedEntries: ConsoleEntry[] = data.tree;
          // for (let i = 0; i < parsedEntries.length; i++) { ... } // Detailed logging removed for brevity now
          setConsoleEntries(parsedEntries);
        } else {
          setConsoleEntries([]);
        }
      } catch (e: any) {
        console.error("Failed to fetch console entries:", e);
        setError(
          `Failed to load consoles. ${e.message || "Please try again later."}`
        );
        setConsoleEntries([]);
      } finally {
        setLoading(false);
      }
    };

    useEffect(() => {
      fetchConsoleEntries();
    }, [currentWorkspace]); // Re-fetch when workspace changes

    useImperativeHandle(ref, () => ({
      refresh: () => {
        fetchConsoleEntries();
      },
    }));

    const handleFolderToggle = (folderPath: string) => {
      dispatch({
        type: "TOGGLE_CONSOLE_FOLDER",
        payload: { folderPath },
      } as any);
    };

    const handleFileClick = async (filePath: string) => {
      if (!currentWorkspace) {
        console.error("No workspace selected");
        return;
      }

      try {
        const response = await fetch(
          `/api/workspaces/${currentWorkspace.id}/consoles/content?path=${filePath}`
        );
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        onConsoleSelect(filePath, data.content);
      } catch (e: any) {
        console.error("Failed to fetch console content:", e);
      }
    };

    const handleMenuOpen = (event: React.MouseEvent<HTMLButtonElement>) => {
      setMenuAnchor(event.currentTarget);
    };

    const handleMenuClose = () => {
      setMenuAnchor(null);
    };

    const handleCreateFolder = () => {
      setFolderDialogOpen(true);
      setSelectedParentFolder(null);
      handleMenuClose();
    };

    const handleCreateFolderInParent = (parentFolderId: string) => {
      setFolderDialogOpen(true);
      setSelectedParentFolder(parentFolderId);
    };

    const handleFolderDialogClose = () => {
      setFolderDialogOpen(false);
      setNewFolderName("");
      setSelectedParentFolder(null);
    };

    const handleFolderCreate = async () => {
      if (!currentWorkspace || !newFolderName.trim()) {
        return;
      }

      try {
        const response = await fetch(
          `/api/workspaces/${currentWorkspace.id}/consoles/folders`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              name: newFolderName.trim(),
              parentId: selectedParentFolder || undefined,
              isPrivate: false,
            }),
          }
        );

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        if (data.success) {
          handleFolderDialogClose();
          fetchConsoleEntries(); // Refresh the tree
        } else {
          console.error("Failed to create folder:", data.error);
        }
      } catch (e: any) {
        console.error("Failed to create folder:", e);
      }
    };

    const handleContextMenu = (event: React.MouseEvent, item: ConsoleEntry) => {
      event.preventDefault();
      setContextMenu({
        mouseX: event.clientX + 2,
        mouseY: event.clientY - 6,
        item,
      });
    };

    const handleContextMenuClose = () => {
      setContextMenu(null);
    };

    const handleRename = (item: ConsoleEntry) => {
      setSelectedItem(item);
      setNewItemName(item.name);
      setRenameDialogOpen(true);
      handleContextMenuClose();
    };

    const handleDelete = (item: ConsoleEntry) => {
      setSelectedItem(item);
      setDeleteDialogOpen(true);
      handleContextMenuClose();
    };

    const handleRenameConfirm = async () => {
      if (!currentWorkspace || !selectedItem || !newItemName.trim()) {
        return;
      }

      try {
        const endpoint = selectedItem.isDirectory
          ? `/api/workspaces/${currentWorkspace.id}/consoles/folders/${selectedItem.id}/rename`
          : `/api/workspaces/${currentWorkspace.id}/consoles/${selectedItem.id}/rename`;

        const response = await fetch(endpoint, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: newItemName.trim(),
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        if (data.success) {
          setRenameDialogOpen(false);
          setSelectedItem(null);
          setNewItemName("");
          fetchConsoleEntries(); // Refresh the tree
        } else {
          console.error("Failed to rename item:", data.error);
        }
      } catch (e: any) {
        console.error("Failed to rename item:", e);
      }
    };

    const handleDeleteConfirm = async () => {
      if (!currentWorkspace || !selectedItem) {
        return;
      }

      try {
        const endpoint = selectedItem.isDirectory
          ? `/api/workspaces/${currentWorkspace.id}/consoles/folders/${selectedItem.id}`
          : `/api/workspaces/${currentWorkspace.id}/consoles/${selectedItem.id}`;

        const response = await fetch(endpoint, {
          method: "DELETE",
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        if (data.success) {
          setDeleteDialogOpen(false);
          setSelectedItem(null);
          fetchConsoleEntries(); // Refresh the tree
        } else {
          console.error("Failed to delete item:", data.error);
        }
      } catch (e: any) {
        console.error("Failed to delete item:", e);
      }
    };

    const renderTree = (nodes: ConsoleEntry[], depth = 0) => {
      return nodes.map((node) => {
        if (node.isDirectory) {
          const isExpanded = expandedFolders.has(node.path);
          return (
            <div key={node.path}>
              <ListItemButton
                onClick={() => handleFolderToggle(node.path)}
                onContextMenu={(e) => handleContextMenu(e, node)}
                sx={{ py: 0.5, pl: 1 + depth }}
              >
                <ListItemIcon sx={{ minWidth: 32 }}>
                  {isExpanded ? <ExpandMoreIcon /> : <ChevronRightIcon />}
                </ListItemIcon>
                <ListItemIcon sx={{ minWidth: 32 }}>
                  <FolderIcon />
                </ListItemIcon>
                <ListItemText
                  primary={node.name}
                  primaryTypographyProps={{
                    variant: "body2",
                    style: {
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    },
                  }}
                />
              </ListItemButton>
              <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                <List component="div" disablePadding dense>
                  {node.children && renderTree(node.children, depth + 1)}
                </List>
              </Collapse>
            </div>
          );
        }
        return (
          <ListItemButton
            key={node.path}
            onClick={() => handleFileClick(node.path)}
            onContextMenu={(e) => handleContextMenu(e, node)}
            sx={{ pl: 0.5 + depth }}
          >
            <ListItemIcon sx={{ minWidth: 32, visibility: "hidden" }} />
            <ListItemIcon sx={{ minWidth: 28 }}>
              <ConsoleIcon size={20} />
            </ListItemIcon>
            <ListItemText
              primary={node.name}
              primaryTypographyProps={{
                variant: "body2",
                fontSize: "0.9rem",
                style: {
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                },
              }}
            />
          </ListItemButton>
        );
      });
    };

    const renderSkeletonItems = () => {
      return Array.from({ length: 3 }).map((_, index) => (
        <ListItemButton key={`skeleton-${index}`} sx={{ pl: 0.5 }}>
          <ListItemIcon sx={{ minWidth: 32, visibility: "hidden" }} />
          <ListItemIcon sx={{ minWidth: 28 }}>
            <Skeleton variant="circular" width={20} height={20} />
          </ListItemIcon>
          <ListItemText
            primary={
              <Skeleton
                variant="text"
                width={`${60 + Math.random() * 40}%`}
                height={20}
              />
            }
          />
        </ListItemButton>
      ));
    };

    return (
      <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
        <Box sx={{ px: 1, py: 0.25, borderBottom: 1, borderColor: "divider" }}>
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Box
              sx={{
                flexGrow: 1,
                overflow: "hidden",
                maxWidth: "calc(100% - 80px)",
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
                Saved Consoles
              </Typography>
            </Box>
            <Box sx={{ display: "flex", gap: 0.5 }}>
              <Tooltip title="Add new folder">
                <IconButton onClick={handleMenuOpen} size="small">
                  <AddIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="Refresh">
                <IconButton onClick={fetchConsoleEntries} size="small">
                  <RefreshIcon />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>
        </Box>
        {error && (
          <Box sx={{ p: 2 }}>
            <Typography color="error" variant="body2">
              {error}
            </Typography>
          </Box>
        )}
        <List
          component="nav"
          dense
          sx={{
            flexGrow: 1,
            overflowY: "auto",
            "&::-webkit-scrollbar": {
              width: "0.4em",
            },
            "&::-webkit-scrollbar-track": {
              boxShadow: "inset 0 0 6px rgba(0,0,0,0.00)",
              webkitBoxShadow: "inset 0 0 6px rgba(0,0,0,0.00)",
            },
            "&::-webkit-scrollbar-thumb": {
              backgroundColor: "rgba(0,0,0,.1)",
              outline: "1px solid slategrey",
            },
          }}
        >
          {loading
            ? renderSkeletonItems()
            : consoleEntries.length > 0
              ? renderTree(consoleEntries)
              : !error && (
                  <Typography
                    sx={{ p: 2, textAlign: "center" }}
                    variant="body2"
                  >
                    No consoles found.
                  </Typography>
                )}
        </List>

        {/* Add Menu */}
        <Menu
          anchorEl={menuAnchor}
          open={Boolean(menuAnchor)}
          onClose={handleMenuClose}
          anchorOrigin={{
            vertical: "bottom",
            horizontal: "right",
          }}
          transformOrigin={{
            vertical: "top",
            horizontal: "right",
          }}
        >
          <MenuItem onClick={handleCreateFolder}>
            <CreateFolderIcon sx={{ mr: 1 }} fontSize="small" />
            New Folder
          </MenuItem>
        </Menu>

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
          <MenuItem onClick={() => handleRename(contextMenu!.item)}>
            <EditIcon sx={{ mr: 1 }} fontSize="small" />
            Rename
          </MenuItem>
          <MenuItem onClick={() => handleDelete(contextMenu!.item)}>
            <DeleteIcon sx={{ mr: 1 }} fontSize="small" />
            Delete
          </MenuItem>
          {contextMenu?.item.isDirectory && (
            <MenuItem
              onClick={() => {
                if (contextMenu.item.id) {
                  handleCreateFolderInParent(contextMenu.item.id);
                }
                handleContextMenuClose();
              }}
            >
              <CreateFolderIcon sx={{ mr: 1 }} fontSize="small" />
              New Subfolder
            </MenuItem>
          )}
        </Menu>

        {/* Create Folder Dialog */}
        <Dialog
          open={folderDialogOpen}
          onClose={handleFolderDialogClose}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle>
            {selectedParentFolder
              ? "Create New Subfolder"
              : "Create New Folder"}
          </DialogTitle>
          <DialogContent>
            <TextField
              autoFocus
              margin="dense"
              label="Folder Name"
              fullWidth
              variant="outlined"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newFolderName.trim()) {
                  handleFolderCreate();
                }
              }}
              helperText="Organize your consoles by creating folders. Right-click folders to create subfolders."
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={handleFolderDialogClose}>Cancel</Button>
            <Button
              onClick={handleFolderCreate}
              disabled={!newFolderName.trim()}
              variant="contained"
            >
              Create
            </Button>
          </DialogActions>
        </Dialog>

        {/* Rename Dialog */}
        <Dialog
          open={renameDialogOpen}
          onClose={() => setRenameDialogOpen(false)}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle>
            Rename {selectedItem?.isDirectory ? "Folder" : "Console"}
          </DialogTitle>
          <DialogContent>
            <TextField
              autoFocus
              margin="dense"
              label="Name"
              fullWidth
              variant="outlined"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newItemName.trim()) {
                  handleRenameConfirm();
                }
              }}
              helperText={
                selectedItem?.isDirectory
                  ? "Enter the new folder name"
                  : "Enter the new console name. Use 'folder/name' to move to a folder."
              }
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setRenameDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleRenameConfirm}
              disabled={!newItemName.trim()}
              variant="contained"
            >
              Rename
            </Button>
          </DialogActions>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog
          open={deleteDialogOpen}
          onClose={() => setDeleteDialogOpen(false)}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle>
            Delete {selectedItem?.isDirectory ? "Folder" : "Console"}
          </DialogTitle>
          <DialogContent>
            <Alert severity="warning" sx={{ mb: 2 }}>
              {selectedItem?.isDirectory
                ? "This will permanently delete the folder and all its contents (subfolders and consoles)."
                : "This will permanently delete the console."}
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
);

export default ConsoleExplorer;
