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
} from "@mui/material";
import {
  FolderOutlined as FolderIcon,
  ExpandMore as ExpandMoreIcon,
  ChevronRight as ChevronRightIcon,
  Refresh as RefreshIcon,
} from "@mui/icons-material";
import { SquareTerminal as ConsoleIcon } from "lucide-react";
import { useAppStore } from "../store/appStore";

interface ConsoleEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: ConsoleEntry[];
  content?: string; // Added to match potential server object, though not used in rendering tree directly
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
    const [consoleEntries, setConsoleEntries] = useState<ConsoleEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const dispatch = useAppStore((s) => s.dispatch);
    const expandedFoldersArray = useAppStore(
      (s) => s.explorers.console.expandedFolders
    );
    const expandedFolders = new Set(expandedFoldersArray);
    const [error, setError] = useState<string | null>(null);

    const fetchConsoleEntries = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/consoles");
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
    }, []);

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
      try {
        const response = await fetch(`/api/consoles/content?path=${filePath}`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        onConsoleSelect(filePath, data.content);
      } catch (e: any) {
        console.error("Failed to fetch console content:", e);
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

    if (loading) {
      return (
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            height: "100%",
          }}
        >
          <CircularProgress />
        </Box>
      );
    }

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
          <IconButton onClick={fetchConsoleEntries} size="small">
            <RefreshIcon />
          </IconButton>
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
          {consoleEntries.length > 0
            ? renderTree(consoleEntries)
            : !loading &&
              !error && (
                <Typography sx={{ p: 2, textAlign: "center" }} variant="body2">
                  No consoles found.
                </Typography>
              )}
        </List>
      </Box>
    );
  }
);

export default ConsoleExplorer;
