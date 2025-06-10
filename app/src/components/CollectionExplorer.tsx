import React, { useState, useEffect, useCallback } from "react";
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
  Chip,
} from "@mui/material";
import {
  TableChartOutlined as CollectionIcon,
  Refresh as RefreshIcon,
  Add as AddIcon,
} from "@mui/icons-material";

interface CollectionInfo {
  name: string;
  type: string;
  options: any;
  info: any;
}

interface CollectionExplorerProps {
  onCollectionSelect: (
    collectionName: string,
    collectionInfo: CollectionInfo,
  ) => void;
  selectedCollection?: string;
  onCreateNew?: () => void;
  onCollectionDoubleClick?: (collection: CollectionInfo) => void;
}

const CollectionExplorer: React.FC<CollectionExplorerProps> = ({
  onCollectionSelect,
  selectedCollection,
  onCreateNew,
  onCollectionDoubleClick,
}) => {
  const [collections, setCollections] = useState<CollectionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCollections = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch("/api/database/collections");
      const data = await response.json();

      if (data.success) {
        // Debug: raw collections data can be inspected here if needed
        // Sort collections alphabetically by name
        const sortedCollections = data.data.sort(
          (a: CollectionInfo, b: CollectionInfo) =>
            a.name.localeCompare(b.name),
        );
        setCollections(sortedCollections);
      } else {
        setError(data.error || "Failed to fetch collections");
      }
    } catch (err) {
      setError("Failed to connect to the database API");
      console.error("Error fetching collections:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCollections();
  }, [fetchCollections]);

  const handleCollectionClick = (collection: CollectionInfo) => {
    // Debug: collection selected
    onCollectionSelect(collection.name, collection);
  };

  const handleRefresh = () => {
    fetchCollections();
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
          <Box
            sx={{
              flexGrow: 1,
              overflow: "hidden",
              maxWidth: "calc(100% - 70px)",
              "& .MuiTypography-root": {
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              },
            }}
          >
            <Typography variant="h6">Collections</Typography>
            <Typography variant="body2" color="text.secondary">
              {collections.length} collection
              {collections.length !== 1 ? "s" : ""} found
            </Typography>
          </Box>
          <Box
            sx={{
              display: "flex",
              flexDirection: "row",
              gap: 0,
              width: "70px",
            }}
          >
            <IconButton size="small" onClick={onCreateNew} color="primary">
              <AddIcon />
            </IconButton>
            <IconButton size="small" onClick={handleRefresh}>
              <RefreshIcon />
            </IconButton>
          </Box>
        </Box>
      </Box>

      <Box sx={{ flexGrow: 1, overflow: "auto" }}>
        {collections.length === 0 ? (
          <Box
            sx={{
              p: 3,
              textAlign: "center",
              color: "text.secondary",
            }}
          >
            <Typography variant="body2">
              No collections found in the database
            </Typography>
          </Box>
        ) : (
          <List dense>
            {collections.map(collection => (
              <ListItem key={collection.name} disablePadding>
                <ListItemButton
                  selected={selectedCollection === collection.name}
                  onClick={() => handleCollectionClick(collection)}
                  onDoubleClick={() => onCollectionDoubleClick?.(collection)}
                  sx={{ py: 0.5, pl: 1 }}
                >
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <CollectionIcon />
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <Box
                        sx={{ display: "flex", alignItems: "center", gap: 1 }}
                      >
                        <Typography
                          variant="body2"
                          sx={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            flexGrow: 1,
                          }}
                        >
                          {collection.name}
                        </Typography>
                        {collection.options?.capped && (
                          <Chip
                            label="Capped"
                            size="small"
                            variant="outlined"
                            color="warning"
                            sx={{ fontSize: "0.7rem", height: 16 }}
                          />
                        )}
                      </Box>
                    }
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        )}
      </Box>
    </Box>
  );
};

export default CollectionExplorer;
