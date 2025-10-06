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
  Menu,
  MenuItem,
  Tooltip,
} from "@mui/material";
import {
  ExpandMore as ExpandMoreIcon,
  ChevronRight as ChevronRightIcon,
  DnsOutlined as ServerIcon,
} from "@mui/icons-material";
import {
  Database as DatabaseIcon,
  Table as CollectionIcon,
  Eye as ViewIcon,
  RotateCw as RefreshIcon,
  FolderClosed as FolderIcon,
  Plus as AddIcon,
  Trash2 as DeleteIcon,
} from "lucide-react";
import { useDatabaseExplorerStore } from "../store";
import { useWorkspace } from "../contexts/workspace-context";
import CreateDatabaseDialog from "./CreateDatabaseDialog";
import { useDatabaseStore } from "../store/databaseStore";
import { useConsoleStore } from "../store/consoleStore";

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
  const {
    servers: serversMap,
    collections,
    views,
    loading: loadingMap,
    refreshServers,
    initServers,
    fetchDatabaseData,
  } = useDatabaseStore();

  const { currentWorkspace } = useWorkspace();

  const { addConsoleTab, setActiveConsole } = useConsoleStore();

  const servers = currentWorkspace ? serversMap[currentWorkspace.id] || [] : [];
  const loading = currentWorkspace ? !!loadingMap[currentWorkspace.id] : false;
  const [loadingData, setLoadingData] = useState<Set<string>>(new Set());
  const error = currentWorkspace
    ? useDatabaseStore.getState().error[currentWorkspace.id]
    : null;

  const {
    expandedServers,
    expandedDatabases,
    expandedCollectionGroups,
    expandedViewGroups,
    toggleServer,
    toggleDatabase,
    toggleCollectionGroup,
    toggleViewGroup,
    isDatabaseExpanded,
  } = useDatabaseExplorerStore();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const refreshServersLocal = async () => {
    if (!currentWorkspace) return;
    await refreshServers(currentWorkspace.id);
  };

  useEffect(() => {
    if (currentWorkspace) {
      initServers(currentWorkspace.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWorkspace?.id]);

  const fetchDatabaseDataLocal = async (databaseId: string) => {
    if (!currentWorkspace) return;
    setLoadingData(prev => new Set(prev).add(databaseId));
    await fetchDatabaseData(currentWorkspace.id, databaseId);
    setLoadingData(prev => {
      const next = new Set(prev);
      next.delete(databaseId);
      return next;
    });
  };

  // Prefetch collections/views for every database under every server when servers change
  useEffect(() => {
    if (!currentWorkspace) return;
    servers.forEach(s => {
      s.databases.forEach(db => {
        if (!collections[db.id] && !views[db.id]) {
          fetchDatabaseDataLocal(db.id);
        }
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servers]);

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
      fetchDatabaseDataLocal(databaseId);
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
    setLoadingData(new Set());

    refreshServersLocal();
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

  // ---------------- Context menu for collections ----------------
  const [contextMenu, setContextMenu] = useState<{
    mouseX: number;
    mouseY: number;
    item: { databaseId: string; collectionName: string };
  } | null>(null);

  const handleCollectionContextMenu = (
    event: React.MouseEvent,
    databaseId: string,
    collectionName: string,
  ) => {
    event.preventDefault();
    setContextMenu({
      mouseX: event.clientX + 2,
      mouseY: event.clientY - 6,
      item: { databaseId, collectionName },
    });
  };

  const handleDropCollection = () => {
    if (!contextMenu) return;
    const { databaseId, collectionName } = contextMenu.item;
    const command = `db.getCollection("${collectionName}").drop()`;
    const tabId = addConsoleTab({
      title: `Drop ${collectionName}`,
      content: command,
      initialContent: command,
      databaseId,
    });
    setActiveConsole(tabId);
    setContextMenu(null);
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
      <Box sx={{ px: 1, py: 0.5, borderBottom: 1, borderColor: "divider" }}>
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
                textTransform: "uppercase",
              }}
            >
              Databases
            </Typography>
          </Box>
          <Box sx={{ display: "flex", gap: 0 }}>
            <Tooltip title="Add new database">
              <IconButton
                size="small"
                onClick={() => setCreateDialogOpen(true)}
              >
                <AddIcon size={20} strokeWidth={2} />
              </IconButton>
            </Tooltip>
            <Tooltip title="Refresh">
              <IconButton size="small" onClick={handleRefresh}>
                <RefreshIcon size={20} strokeWidth={2} />
              </IconButton>
            </Tooltip>
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
                      sx={{ py: 0.5, pl: 0.5 }}
                    >
                      <ListItemIcon sx={{ minWidth: 24, mr: 0 }}>
                        {isServerExpanded ? (
                          <ExpandMoreIcon />
                        ) : (
                          <ChevronRightIcon />
                        )}
                      </ListItemIcon>
                      <ListItemIcon sx={{ minWidth: 24 }}>
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
                                  <DatabaseIcon size={24} strokeWidth={1.5} />
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
                                      <FolderIcon size={24} strokeWidth={1.5} />
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
                                            onContextMenu={e =>
                                              handleCollectionContextMenu(
                                                e,
                                                database.id,
                                                collection.name,
                                              )
                                            }
                                            sx={{ py: 0.25, pl: 7.5 }}
                                          >
                                            <ListItemIcon sx={{ minWidth: 28 }}>
                                              <CollectionIcon
                                                size={18}
                                                strokeWidth={1.5}
                                              />
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
                                      <FolderIcon size={24} strokeWidth={1.5} />
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
                                              <ViewIcon
                                                size={18}
                                                strokeWidth={1.5}
                                              />
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

      {/* Context Menu for collection */}
      <Menu
        open={contextMenu !== null}
        onClose={() => setContextMenu(null)}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenu !== null
            ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
            : undefined
        }
        PaperProps={{
          elevation: 2,
          sx: {
            boxShadow: "0px 2px 4px rgba(0,0,0,0.12)",
            minWidth: 180,
          },
        }}
      >
        <MenuItem
          onClick={handleDropCollection}
          sx={{
            pl: 1,
            pr: 1,
            "& .MuiListItemIcon-root": {
              minWidth: 26,
            },
          }}
        >
          <ListItemIcon>
            <DeleteIcon size={18} strokeWidth={1.5} />
          </ListItemIcon>
          Delete collection
        </MenuItem>
      </Menu>
    </Box>
  );
};

export default DatabaseExplorer;
