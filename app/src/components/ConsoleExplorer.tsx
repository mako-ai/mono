import { useEffect, useState, forwardRef, useImperativeHandle } from "react";
import {
  Box,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Collapse,
  CircularProgress,
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
} from "@mui/material";
import {
  FolderOutlined as FolderIcon,
  ExpandMore as ExpandMoreIcon,
  ChevronRight as ChevronRightIcon,
  Refresh as RefreshIcon,
  Add as AddIcon,
  CreateNewFolder as CreateFolderIcon,
  MoreVert as MoreVertIcon,
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

    const renderTree = (nodes: ConsoleEntry[], depth = 0) => {
      return nodes.map((node) => {
        if (node.isDirectory) {
          const isExpanded = expandedFolders.has(node.path);
          return (
            <div key={node.path}>
              <ListItemButton
                onClick={() => handleFolderToggle(node.path)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (node.id) {
                    handleCreateFolderInParent(node.id);
                  }
                }}
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
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            p: 1,
            borderBottom: 1,
            borderColor: "divider",
          }}
        >
          <Typography variant="subtitle1" sx={{ ml: 1 }}>
            Console Explorer
          </Typography>
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
      </Box>
    );
  }
);

export default ConsoleExplorer;
