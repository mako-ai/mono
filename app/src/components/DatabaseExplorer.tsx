import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Alert,
  IconButton,
  Collapse,
  Chip,
  SvgIcon,
  Skeleton,
} from "@mui/material";
import {
  DnsOutlined as ServerIcon,
  TableChartOutlined as CollectionIcon,
  VisibilityOutlined as ViewIcon,
  Refresh as RefreshIcon,
  ExpandMore as ExpandMoreIcon,
  ChevronRight as ChevronRightIcon,
  FolderOutlined as FolderIcon,
  Add as AddIcon,
} from "@mui/icons-material";
import { Database as DatabaseIcon } from "lucide-react";
import { useDatabaseExplorerStore } from "../store";
import { useWorkspace } from "../contexts/workspace-context";
import CreateDatabaseDialog from "./CreateDatabaseDialog";

const MongoDBIcon = () => (
  <SvgIcon>
    <svg
      height="2500"
      viewBox="8.738 -5.03622834 17.45992422 39.40619484"
      width="2500"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="m15.9.087.854 1.604c.192.296.4.558.645.802a22.406 22.406 0 0 1 2.004 2.266c1.447 1.9 2.423 4.01 3.12 6.292.418 1.394.645 2.824.662 4.27.07 4.323-1.412 8.035-4.4 11.12a12.7 12.7 0 0 1 -1.57 1.342c-.296 0-.436-.227-.558-.436a3.589 3.589 0 0 1 -.436-1.255c-.105-.523-.174-1.046-.14-1.586v-.244c-.024-.052-.285-24.052-.181-24.175z"
        fill="#599636"
      />
      <path
        d="m15.9.034c-.035-.07-.07-.017-.105.017.017.35-.105.662-.296.96-.21.296-.488.523-.767.767-1.55 1.342-2.77 2.963-3.747 4.776-1.3 2.44-1.97 5.055-2.16 7.808-.087.993.314 4.497.627 5.508.854 2.684 2.388 4.933 4.375 6.885.488.47 1.01.906 1.55 1.325.157 0 .174-.14.21-.244a4.78 4.78 0 0 0 .157-.68l.35-2.614z"
        fill="#6cac48"
      />
      <path
        d="m16.754 28.845c.035-.4.227-.732.436-1.063-.21-.087-.366-.26-.488-.453a3.235 3.235 0 0 1 -.26-.575c-.244-.732-.296-1.5-.366-2.248v-.453c-.087.07-.105.662-.105.75a17.37 17.37 0 0 1 -.314 2.353c-.052.314-.087.627-.28.906 0 .035 0 .07.017.122.314.924.4 1.865.453 2.824v.35c0 .418-.017.33.33.47.14.052.296.07.436.174.105 0 .122-.087.122-.157l-.052-.575v-1.604c-.017-.28.035-.558.07-.82z"
        fill="#c2bfbf"
      />
    </svg>
  </SvgIcon>
);

interface Database {
  id: string;
  name: string;
  description: string;
  database: string;
  type: string;
  active: boolean;
  lastConnectedAt?: string;
  displayName: string;
  hostKey: string;
  hostName: string;
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
    collectionInfo: CollectionInfo,
  ) => void;
  onCollectionClick?: (databaseId: string, collection: CollectionInfo) => void;
}

const DatabaseExplorer: React.FC<DatabaseExplorerProps> = ({
  onCollectionSelect,
  onCollectionClick,
}) => {
  const [servers, setServers] = useState<Server[]>([]);
  const [collections, setCollections] = useState<
    Record<string, CollectionInfo[]>
  >({});
  const [views, setViews] = useState<Record<string, CollectionInfo[]>>({});
  const [loading, setLoading] = useState(true);
  const [loadingData, setLoadingData] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  // Use the store for expanded states
  const {
    expandedServers,
    expandedDatabases,
    expandedCollectionGroups,
    expandedViewGroups,
    toggleServer,
    toggleDatabase,
    toggleCollectionGroup,
    toggleViewGroup,
    expandServer,
    expandDatabase,
    isDatabaseExpanded,
  } = useDatabaseExplorerStore();

  // Use the workspace context
  const { currentWorkspace } = useWorkspace();

  useEffect(() => {
    fetchServers();
  }, [currentWorkspace]);

  const fetchServers = async () => {
    if (!currentWorkspace) return;

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(
        `/api/workspaces/${currentWorkspace.id}/databases`,
      );
      const data = await response.json();

      if (data.success) {
        // Group databases by host on the frontend
        const serverMap = new Map<string, Server>();

        data.data.forEach((db: Database) => {
          const hostKey = db.hostKey;

          if (!serverMap.has(hostKey)) {
            serverMap.set(hostKey, {
              id: hostKey,
              name: db.hostName,
              description: "",
              connectionString: db.hostKey,
              active: true,
              databases: [],
            });
          }

          const server = serverMap.get(hostKey)!;
          server.databases.push(db);
        });

        // Convert map to array
        const serversData = Array.from(serverMap.values());
        setServers(serversData);

        // Clear any previously cached collections/views so we always show fresh data
        setCollections({});
        setViews({});

        // Automatically fetch collections/views for every database so that the
        // data tree is fully up-to-date after a refresh.
        data.data.forEach((db: Database) => {
          fetchDatabaseData(db.id);
        });

        // Only auto-expand the first server/database if nothing is expanded yet
        if (serversData.length > 0 && expandedServers.size === 0) {
          const firstServerId = serversData[0].id;
          expandServer(firstServerId);
          if (serversData[0].databases.length > 0) {
            const firstDbId = serversData[0].databases[0].id;
            expandDatabase(firstDbId);
          }
        }
      } else {
        setError(data.error || "Failed to fetch databases");
      }
    } catch (err) {
      setError("Failed to connect to the database API");
      console.error("Error fetching databases:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchDatabaseData = async (databaseId: string) => {
    if (!currentWorkspace) return;

    try {
      setLoadingData(prev => new Set(prev).add(databaseId));

      // Fetch both collections and views in parallel
      const [collectionsResponse, viewsResponse] = await Promise.all([
        fetch(
          `/api/workspaces/${currentWorkspace.id}/databases/${databaseId}/collections`,
        ),
        fetch(
          `/api/workspaces/${currentWorkspace.id}/databases/${databaseId}/views`,
        ),
      ]);

      const collectionsData = await collectionsResponse.json();
      const viewsData = await viewsResponse.json();

      if (collectionsData.success) {
        const sortedCollections = collectionsData.data.sort(
          (a: CollectionInfo, b: CollectionInfo) =>
            a.name.localeCompare(b.name),
        );
        setCollections(prev => ({
          ...prev,
          [databaseId]: sortedCollections,
        }));
      }

      if (viewsData.success) {
        const sortedViews = viewsData.data.sort(
          (a: CollectionInfo, b: CollectionInfo) =>
            a.name.localeCompare(b.name),
        );
        setViews(prev => ({
          ...prev,
          [databaseId]: sortedViews,
        }));
      }
    } catch (err) {
      console.error(`Error fetching data for ${databaseId}:`, err);
    } finally {
      setLoadingData(prev => {
        const next = new Set(prev);
        next.delete(databaseId);
        return next;
      });
    }
  };

  const handleServerToggle = (serverId: string) => {
    toggleServer(serverId);
  };

  const handleDatabaseToggle = (databaseId: string) => {
    toggleDatabase(databaseId);
    // Fetch data if not already loaded and we're expanding
    if (
      !isDatabaseExpanded(databaseId) &&
      !collections[databaseId] &&
      !views[databaseId]
    ) {
      fetchDatabaseData(databaseId);
    }
  };

  const handleCollectionGroupToggle = (databaseId: string) => {
    toggleCollectionGroup(databaseId);
  };

  const handleViewGroupToggle = (databaseId: string) => {
    toggleViewGroup(databaseId);
  };

  const handleCollectionClick = (
    databaseId: string,
    collection: CollectionInfo,
  ) => {
    onCollectionSelect?.(databaseId, collection.name, collection);
    onCollectionClick?.(databaseId, collection);
  };

  const handleRefresh = () => {
    // Clear cached data so we don't keep stale information around between refreshes
    setCollections({});
    setViews({});
    setLoadingData(new Set());

    fetchServers();
  };

  const handleDatabaseCreated = () => {
    // Refresh the server data after creating a new database
    handleRefresh();
  };

  const renderSkeletonItems = () => {
    return Array.from({ length: 3 }).map((_, index) => (
      <ListItem key={`skeleton-${index}`} disablePadding>
        <ListItemButton sx={{ py: 0.5, pl: 1 }}>
          <ListItemIcon sx={{ minWidth: 32 }}>
            <Skeleton variant="circular" width={20} height={20} />
          </ListItemIcon>
          <ListItemIcon sx={{ minWidth: 32 }}>
            <Skeleton variant="circular" width={24} height={24} />
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
      </ListItem>
    ));
  };

  const renderCollectionSkeletonItems = () => {
    return Array.from({ length: 3 }).map((_, index) => (
      <ListItem key={`collection-skeleton-${index}`} disablePadding>
        <ListItemButton sx={{ py: 0.25, pl: 7.5 }}>
          <ListItemIcon sx={{ minWidth: 28 }}>
            <Skeleton variant="circular" width={16} height={16} />
          </ListItemIcon>
          <ListItemText
            primary={
              <Skeleton
                variant="text"
                width={`${50 + Math.random() * 30}%`}
                height={16}
              />
            }
          />
        </ListItemButton>
      </ListItem>
    ));
  };

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
              Databases
            </Typography>
          </Box>
          <Box sx={{ display: "flex" }}>
            <IconButton size="small" onClick={() => setCreateDialogOpen(true)}>
              <AddIcon />
            </IconButton>
            <IconButton size="small" onClick={handleRefresh}>
              <RefreshIcon />
            </IconButton>
          </Box>
        </Box>
      </Box>

      <Box sx={{ flexGrow: 1, overflow: "auto" }}>
        <List dense>
          {loading ? (
            renderSkeletonItems()
          ) : servers.length === 0 ? (
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
            servers.map(server => {
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
                        {server.connectionString.includes("mongodb") ? (
                          <MongoDBIcon />
                        ) : (
                          <ServerIcon />
                        )}
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
                      {server.databases.map(database => {
                        const isDatabaseExpanded = expandedDatabases.has(
                          database.id,
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
                                  <DatabaseIcon size={24} />
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
                                        {database.displayName}
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
                                        database.id,
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
                                          Collections (
                                          {isLoadingData
                                            ? "..."
                                            : dbCollections.length}
                                          )
                                        </Typography>
                                      }
                                    />
                                  </ListItemButton>
                                </ListItem>

                                <Collapse
                                  in={expandedCollectionGroups.has(database.id)}
                                  timeout="auto"
                                  unmountOnExit
                                >
                                  <List dense disablePadding>
                                    {isLoadingData ? (
                                      renderCollectionSkeletonItems()
                                    ) : dbCollections.length === 0 ? (
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
                                      dbCollections.map(collection => (
                                        <ListItem
                                          key={collection.name}
                                          disablePadding
                                        >
                                          <ListItemButton
                                            onClick={() =>
                                              handleCollectionClick(
                                                database.id,
                                                collection,
                                              )
                                            }
                                            sx={{ py: 0.25, pl: 7.5 }}
                                          >
                                            <ListItemIcon sx={{ minWidth: 28 }}>
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
                                                      textOverflow: "ellipsis",
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
                                    sx={{ py: 0.5, pl: 3 }}
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
                                          Views (
                                          {isLoadingData
                                            ? "..."
                                            : dbViews.length}
                                          )
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
                                    {isLoadingData ? (
                                      renderCollectionSkeletonItems()
                                    ) : dbViews.length === 0 ? (
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
                                      dbViews.map(view => (
                                        <ListItem
                                          key={view.name}
                                          disablePadding
                                        >
                                          <ListItemButton
                                            sx={{ py: 0.25, pl: 7.5 }}
                                          >
                                            <ListItemIcon sx={{ minWidth: 28 }}>
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
                            </Collapse>
                          </React.Fragment>
                        );
                      })}
                    </List>
                  </Collapse>
                </React.Fragment>
              );
            })
          )}
        </List>
      </Box>

      <CreateDatabaseDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        onSuccess={handleDatabaseCreated}
      />
    </Box>
  );
};

export default DatabaseExplorer;
