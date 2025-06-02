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
  Collapse,
  Chip,
} from "@mui/material";
import {
  DnsOutlined as ServerIcon,
  StorageOutlined as DatabaseIcon,
  TableChartOutlined as CollectionIcon,
  VisibilityOutlined as ViewIcon,
  Refresh as RefreshIcon,
  ExpandMore as ExpandMoreIcon,
  ChevronRight as ChevronRightIcon,
  FolderOutlined as FolderIcon,
} from "@mui/icons-material";

interface Database {
  id: string;
  localId: string;
  name: string;
  description: string;
  database: string;
  active: boolean;
}

interface Server {
  id: string;
  name: string;
  description: string;
  connectionString: string;
  active: boolean;
  databases: Database[];
}

interface CollectionInfo {
  name: string;
  type: string;
  options: any;
}

interface DatabaseExplorerProps {
  onCollectionSelect?: (
    databaseId: string,
    collectionName: string,
    collectionInfo: CollectionInfo
  ) => void;
  onCollectionDoubleClick?: (
    databaseId: string,
    collection: CollectionInfo
  ) => void;
}

const DatabaseExplorer: React.FC<DatabaseExplorerProps> = ({
  onCollectionSelect,
  onCollectionDoubleClick,
}) => {
  const [servers, setServers] = useState<Server[]>([]);
  const [expandedServers, setExpandedServers] = useState<Set<string>>(
    new Set()
  );
  const [expandedDatabases, setExpandedDatabases] = useState<Set<string>>(
    new Set()
  );
  const [expandedCollectionGroups, setExpandedCollectionGroups] = useState<
    Set<string>
  >(new Set());
  const [expandedViewGroups, setExpandedViewGroups] = useState<Set<string>>(
    new Set()
  );
  const [collections, setCollections] = useState<
    Record<string, CollectionInfo[]>
  >({});
  const [views, setViews] = useState<Record<string, CollectionInfo[]>>({});
  const [loading, setLoading] = useState(true);
  const [loadingData, setLoadingData] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchServers();
  }, []);

  const fetchServers = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch("/api/databases/servers");
      const data = await response.json();

      if (data.success) {
        setServers(data.data);

        // Clear any previously cached collections/views so we always show fresh data
        setCollections({});
        setViews({});

        // Automatically fetch collections/views for every database so that the
        // data tree is fully up-to-date after a refresh.
        data.data.forEach((srv: Server) => {
          srv.databases.forEach((db) => {
            fetchDatabaseData(db.id);
          });
        });

        // Keep the previous behaviour of auto-expanding the first server/database (optional)
        if (data.data.length > 0) {
          const firstServerId = data.data[0].id;
          setExpandedServers(new Set([firstServerId]));
          if (data.data[0].databases.length > 0) {
            const firstDbId = data.data[0].databases[0].id;
            setExpandedDatabases(new Set([firstDbId]));
          }
        }
      } else {
        setError(data.error || "Failed to fetch servers");
      }
    } catch (err) {
      setError("Failed to connect to the database API");
      console.error("Error fetching servers:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchDatabaseData = async (databaseId: string) => {
    try {
      setLoadingData((prev) => new Set(prev).add(databaseId));

      // Fetch both collections and views in parallel
      const [collectionsResponse, viewsResponse] = await Promise.all([
        fetch(`/api/databases/${databaseId}/collections`),
        fetch(`/api/databases/${databaseId}/views`),
      ]);

      const collectionsData = await collectionsResponse.json();
      const viewsData = await viewsResponse.json();

      if (collectionsData.success) {
        const sortedCollections = collectionsData.data.sort(
          (a: CollectionInfo, b: CollectionInfo) => a.name.localeCompare(b.name)
        );
        setCollections((prev) => ({
          ...prev,
          [databaseId]: sortedCollections,
        }));
      }

      if (viewsData.success) {
        const sortedViews = viewsData.data.sort(
          (a: CollectionInfo, b: CollectionInfo) => a.name.localeCompare(b.name)
        );
        setViews((prev) => ({
          ...prev,
          [databaseId]: sortedViews,
        }));
      }
    } catch (err) {
      console.error(`Error fetching data for ${databaseId}:`, err);
    } finally {
      setLoadingData((prev) => {
        const next = new Set(prev);
        next.delete(databaseId);
        return next;
      });
    }
  };

  const handleServerToggle = (serverId: string) => {
    setExpandedServers((prev) => {
      const next = new Set(prev);
      if (next.has(serverId)) {
        next.delete(serverId);
      } else {
        next.add(serverId);
      }
      return next;
    });
  };

  const handleDatabaseToggle = (databaseId: string) => {
    setExpandedDatabases((prev) => {
      const next = new Set(prev);
      if (next.has(databaseId)) {
        next.delete(databaseId);
      } else {
        next.add(databaseId);
        // Fetch data if not already loaded
        if (!collections[databaseId] && !views[databaseId]) {
          fetchDatabaseData(databaseId);
        }
      }
      return next;
    });
  };

  const handleCollectionGroupToggle = (databaseId: string) => {
    setExpandedCollectionGroups((prev) => {
      const next = new Set(prev);
      if (next.has(databaseId)) {
        next.delete(databaseId);
      } else {
        next.add(databaseId);
      }
      return next;
    });
  };

  const handleViewGroupToggle = (databaseId: string) => {
    setExpandedViewGroups((prev) => {
      const next = new Set(prev);
      if (next.has(databaseId)) {
        next.delete(databaseId);
      } else {
        next.add(databaseId);
      }
      return next;
    });
  };

  const handleCollectionClick = (
    databaseId: string,
    collection: CollectionInfo
  ) => {
    onCollectionSelect?.(databaseId, collection.name, collection);
  };

  const handleRefresh = () => {
    // Clear cached data so we don't keep stale information around between refreshes
    setCollections({});
    setViews({});
    setLoadingData(new Set());

    fetchServers();
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
              maxWidth: "calc(100% - 40px)",
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
              Databases
            </Typography>
          </Box>
          <IconButton size="small" onClick={handleRefresh}>
            <RefreshIcon />
          </IconButton>
        </Box>
      </Box>

      <Box sx={{ flexGrow: 1, overflow: "auto" }}>
        {servers.length === 0 ? (
          <Box
            sx={{
              p: 3,
              textAlign: "center",
              color: "text.secondary",
            }}
          >
            <Typography variant="body2">
              No servers found in configuration
            </Typography>
          </Box>
        ) : (
          <List dense>
            {servers.map((server) => {
              const isServerExpanded = expandedServers.has(server.id);

              return (
                <React.Fragment key={server.id}>
                  {/* Server Level */}
                  <ListItem disablePadding>
                    <ListItemButton
                      onClick={() => handleServerToggle(server.id)}
                      sx={{ py: 0.5, pl: 1 }}
                    >
                      <ListItemIcon sx={{ minWidth: 32 }}>
                        {isServerExpanded ? (
                          <ExpandMoreIcon />
                        ) : (
                          <ChevronRightIcon />
                        )}
                      </ListItemIcon>
                      <ListItemIcon sx={{ minWidth: 32 }}>
                        <ServerIcon />
                      </ListItemIcon>
                      <ListItemText
                        primary={
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 1,
                              overflow: "hidden",
                            }}
                          >
                            <Typography
                              variant="body2"
                              fontWeight="bold"
                              sx={{
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {server.name}
                            </Typography>
                          </Box>
                        }
                      />
                    </ListItemButton>
                  </ListItem>

                  <Collapse in={isServerExpanded} timeout="auto" unmountOnExit>
                    <List dense disablePadding>
                      {server.databases.map((database) => {
                        const isDatabaseExpanded = expandedDatabases.has(
                          database.id
                        );
                        const isLoadingData = loadingData.has(database.id);
                        const dbCollections = collections[database.id] || [];
                        const dbViews = views[database.id] || [];

                        return (
                          <React.Fragment key={database.id}>
                            {/* Database Level */}
                            <ListItem disablePadding>
                              <ListItemButton
                                onClick={() =>
                                  handleDatabaseToggle(database.id)
                                }
                                sx={{ py: 0.5, pl: 2 }}
                              >
                                <ListItemIcon sx={{ minWidth: 32 }}>
                                  {isDatabaseExpanded ? (
                                    <ExpandMoreIcon />
                                  ) : (
                                    <ChevronRightIcon />
                                  )}
                                </ListItemIcon>
                                <ListItemIcon sx={{ minWidth: 32 }}>
                                  <DatabaseIcon />
                                </ListItemIcon>
                                <ListItemText
                                  primary={
                                    <Box
                                      sx={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 1,
                                        overflow: "hidden",
                                      }}
                                    >
                                      <Typography
                                        variant="body2"
                                        sx={{
                                          overflow: "hidden",
                                          textOverflow: "ellipsis",
                                          whiteSpace: "nowrap",
                                        }}
                                      >
                                        {database.database}
                                      </Typography>
                                    </Box>
                                  }
                                />
                              </ListItemButton>
                            </ListItem>

                            <Collapse
                              in={isDatabaseExpanded}
                              timeout="auto"
                              unmountOnExit
                            >
                              {isLoadingData ? (
                                <Box
                                  sx={{
                                    py: 2,
                                    display: "flex",
                                    justifyContent: "center",
                                  }}
                                >
                                  <CircularProgress size={20} />
                                </Box>
                              ) : (
                                <List dense disablePadding>
                                  {/* Collections Group */}
                                  <ListItem disablePadding>
                                    <ListItemButton
                                      onClick={() =>
                                        handleCollectionGroupToggle(database.id)
                                      }
                                      sx={{ py: 0.5, pl: 3 }}
                                    >
                                      <ListItemIcon sx={{ minWidth: 32 }}>
                                        {expandedCollectionGroups.has(
                                          database.id
                                        ) ? (
                                          <ExpandMoreIcon />
                                        ) : (
                                          <ChevronRightIcon />
                                        )}
                                      </ListItemIcon>
                                      <ListItemIcon sx={{ minWidth: 32 }}>
                                        <FolderIcon />
                                      </ListItemIcon>
                                      <ListItemText
                                        primary={
                                          <Typography
                                            variant="body2"
                                            sx={{
                                              overflow: "hidden",
                                              textOverflow: "ellipsis",
                                              whiteSpace: "nowrap",
                                            }}
                                          >
                                            Collections ({dbCollections.length})
                                          </Typography>
                                        }
                                      />
                                    </ListItemButton>
                                  </ListItem>

                                  <Collapse
                                    in={expandedCollectionGroups.has(
                                      database.id
                                    )}
                                    timeout="auto"
                                    unmountOnExit
                                  >
                                    <List dense disablePadding>
                                      {dbCollections.length === 0 ? (
                                        <Box
                                          sx={{
                                            py: 1,
                                            pl: 9,
                                            color: "text.secondary",
                                          }}
                                        >
                                          <Typography variant="caption">
                                            No collections found
                                          </Typography>
                                        </Box>
                                      ) : (
                                        dbCollections.map((collection) => (
                                          <ListItem
                                            key={collection.name}
                                            disablePadding
                                          >
                                            <ListItemButton
                                              onClick={() =>
                                                handleCollectionClick(
                                                  database.id,
                                                  collection
                                                )
                                              }
                                              onDoubleClick={() =>
                                                onCollectionDoubleClick?.(
                                                  database.id,
                                                  collection
                                                )
                                              }
                                              sx={{ py: 0.25, pl: 7.5 }}
                                            >
                                              <ListItemIcon
                                                sx={{ minWidth: 28 }}
                                              >
                                                <CollectionIcon fontSize="small" />
                                              </ListItemIcon>
                                              <ListItemText
                                                primary={
                                                  <Box
                                                    sx={{
                                                      display: "flex",
                                                      alignItems: "center",
                                                      gap: 1,
                                                      overflow: "hidden",
                                                    }}
                                                  >
                                                    <Typography
                                                      variant="body2"
                                                      fontSize="0.8rem"
                                                      sx={{
                                                        overflow: "hidden",
                                                        textOverflow:
                                                          "ellipsis",
                                                        whiteSpace: "nowrap",
                                                      }}
                                                    >
                                                      {collection.name}
                                                    </Typography>
                                                    {collection.options
                                                      ?.capped && (
                                                      <Chip
                                                        label="Capped"
                                                        size="small"
                                                        variant="outlined"
                                                        color="warning"
                                                        sx={{
                                                          fontSize: "0.65rem",
                                                          height: 14,
                                                          flexShrink: 0,
                                                        }}
                                                      />
                                                    )}
                                                  </Box>
                                                }
                                              />
                                            </ListItemButton>
                                          </ListItem>
                                        ))
                                      )}
                                    </List>
                                  </Collapse>

                                  {/* Views Group */}
                                  <ListItem disablePadding>
                                    <ListItemButton
                                      onClick={() =>
                                        handleViewGroupToggle(database.id)
                                      }
                                      sx={{ py: 0.5, pl: 4 }}
                                    >
                                      <ListItemIcon sx={{ minWidth: 32 }}>
                                        {expandedViewGroups.has(database.id) ? (
                                          <ExpandMoreIcon />
                                        ) : (
                                          <ChevronRightIcon />
                                        )}
                                      </ListItemIcon>
                                      <ListItemIcon sx={{ minWidth: 32 }}>
                                        <FolderIcon />
                                      </ListItemIcon>
                                      <ListItemText
                                        primary={
                                          <Typography
                                            variant="body2"
                                            sx={{
                                              overflow: "hidden",
                                              textOverflow: "ellipsis",
                                              whiteSpace: "nowrap",
                                            }}
                                          >
                                            Views ({dbViews.length})
                                          </Typography>
                                        }
                                      />
                                    </ListItemButton>
                                  </ListItem>

                                  <Collapse
                                    in={expandedViewGroups.has(database.id)}
                                    timeout="auto"
                                    unmountOnExit
                                  >
                                    <List dense disablePadding>
                                      {dbViews.length === 0 ? (
                                        <Box
                                          sx={{
                                            py: 1,
                                            pl: 9,
                                            color: "text.secondary",
                                          }}
                                        >
                                          <Typography variant="caption">
                                            No views found
                                          </Typography>
                                        </Box>
                                      ) : (
                                        dbViews.map((view) => (
                                          <ListItem
                                            key={view.name}
                                            disablePadding
                                          >
                                            <ListItemButton
                                              sx={{ py: 0.25, pl: 8.5 }}
                                            >
                                              <ListItemIcon
                                                sx={{ minWidth: 28 }}
                                              >
                                                <ViewIcon fontSize="small" />
                                              </ListItemIcon>
                                              <ListItemText
                                                primary={
                                                  <Typography
                                                    variant="body2"
                                                    fontSize="0.8rem"
                                                    sx={{
                                                      overflow: "hidden",
                                                      textOverflow: "ellipsis",
                                                      whiteSpace: "nowrap",
                                                    }}
                                                  >
                                                    {view.name}
                                                  </Typography>
                                                }
                                              />
                                            </ListItemButton>
                                          </ListItem>
                                        ))
                                      )}
                                    </List>
                                  </Collapse>
                                </List>
                              )}
                            </Collapse>
                          </React.Fragment>
                        );
                      })}
                    </List>
                  </Collapse>
                </React.Fragment>
              );
            })}
          </List>
        )}
      </Box>
    </Box>
  );
};

export default DatabaseExplorer;
