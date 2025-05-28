import React, { useState, useEffect } from "react";
import {
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Collapse,
  CircularProgress,
  Typography,
} from "@mui/material";
import {
  DescriptionOutlined,
  ExpandLess,
  ExpandMore,
  FolderOutlined,
} from "@mui/icons-material";

interface QueryFile {
  path: string;
  name: string;
  content: string;
  isDirectory: boolean;
  children?: QueryFile[];
}

interface QueryExplorerProps {
  onQuerySelect: (queryPath: string, content: string) => void;
}

const QueryExplorer: React.FC<QueryExplorerProps> = ({ onQuerySelect }) => {
  const [queries, setQueries] = useState<QueryFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set()
  );
  const [selectedQuery, setSelectedQuery] = useState<string>("");

  useEffect(() => {
    fetchQueries();
  }, []);

  const fetchQueries = async () => {
    try {
      const response = await fetch("/api/queries");
      const data = await response.json();

      if (data.success) {
        setQueries(data.data);
      } else {
        setError(data.error || "Failed to load queries");
      }
    } catch (err) {
      setError("Failed to connect to server");
    } finally {
      setLoading(false);
    }
  };

  const handleFolderToggle = (folderPath: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folderPath)) {
      newExpanded.delete(folderPath);
    } else {
      newExpanded.add(folderPath);
    }
    setExpandedFolders(newExpanded);
  };

  const handleQueryClick = (queryFile: QueryFile) => {
    if (!queryFile.isDirectory) {
      setSelectedQuery(queryFile.path);
      onQuerySelect(queryFile.path, queryFile.content);
    }
  };

  const renderQueryItem = (queryFile: QueryFile, level: number = 0) => {
    const isExpanded = expandedFolders.has(queryFile.path);
    const isSelected = selectedQuery === queryFile.path;

    return (
      <React.Fragment key={queryFile.path}>
        <ListItem disablePadding>
          <ListItemButton
            sx={{ py: 0.5, pl: level * 2 + 1 }}
            onClick={() => {
              if (queryFile.isDirectory) {
                handleFolderToggle(queryFile.path);
              } else {
                handleQueryClick(queryFile);
              }
            }}
            selected={isSelected}
          >
            <ListItemIcon>
              {queryFile.isDirectory ? (
                <FolderOutlined />
              ) : (
                <DescriptionOutlined />
              )}
            </ListItemIcon>
            <ListItemText primary={queryFile.name} />
            {queryFile.isDirectory &&
              (isExpanded ? <ExpandLess /> : <ExpandMore />)}
          </ListItemButton>
        </ListItem>

        {queryFile.isDirectory && queryFile.children && (
          <Collapse in={isExpanded} timeout="auto" unmountOnExit>
            {queryFile.children.map((child) =>
              renderQueryItem(child, level + 1)
            )}
          </Collapse>
        )}
      </React.Fragment>
    );
  };

  if (loading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        height="200px"
      >
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={2}>
        <Typography color="error">{error}</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height: "100%", overflow: "auto" }}>
      <Typography variant="h6" m={1}>
        EXPLORER
      </Typography>
      <List dense>
        {queries.map((queryFile) => renderQueryItem(queryFile))}
      </List>
    </Box>
  );
};

export default QueryExplorer;
