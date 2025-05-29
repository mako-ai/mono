import React, { useState, useRef, useEffect } from "react";
import {
  Box,
  Typography,
  styled,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  IconButton,
  Alert,
  Snackbar,
  Tabs,
  Tab,
} from "@mui/material";
import { Close as CloseIcon } from "@mui/icons-material";
import CollectionExplorer from "../components/CollectionExplorer";
import CollectionEditor, {
  CollectionEditorRef,
} from "../components/CollectionEditor";
import CreateCollectionDialog from "../components/CreateCollectionDialog";
import ResultsTable from "../components/ResultsTable";
import { Chat } from "../components/Chat";
// @ts-ignore – types will be available once the package is installed
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import Console, { ConsoleRef } from "../components/Console";

interface CollectionInfo {
  name: string;
  type: string;
  options: any;
  info: any;
}

interface QueryResult {
  results: any[];
  executedAt: string;
  resultCount: number;
}

// Styled PanelResizeHandle components
const StyledHorizontalResizeHandle = styled(PanelResizeHandle)(({ theme }) => ({
  width: "4px",
  background: theme.palette.divider,
  cursor: "col-resize",
  transition: "background-color 0.2s ease",
  "&:hover": {
    backgroundColor: theme.palette.primary.main,
  },
}));

const StyledVerticalResizeHandle = styled(PanelResizeHandle)(({ theme }) => ({
  height: "4px",
  background: theme.palette.divider,
  cursor: "row-resize",
  transition: "background-color 0.2s ease",
  "&:hover": {
    backgroundColor: theme.palette.primary.main,
  },
}));

function Collections() {
  const [selectedCollection, setSelectedCollection] = useState<string>("");
  const [collectionInfo, setCollectionInfo] = useState<CollectionInfo | null>(
    null
  );
  const [queryResults, setQueryResults] = useState<QueryResult | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [errorModalOpen, setErrorModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [currentEditorContent, setCurrentEditorContent] = useState<
    | {
        content: string;
        fileName?: string;
        language?: string;
      }
    | undefined
  >(undefined);
  const collectionEditorRef = useRef<CollectionEditorRef>(null);

  // New state for console tabs
  interface ConsoleTab {
    id: string;
    title: string;
    initialContent: string;
  }

  const [consoleTabs, setConsoleTabs] = useState<ConsoleTab[]>([]);
  const [activeConsoleId, setActiveConsoleId] = useState<string | null>(null);
  const consoleRefs = useRef<Record<string, React.RefObject<ConsoleRef>>>({});

  const openNewConsole = (
    initialContent: string = "",
    title: string = "Console"
  ) => {
    const id = Date.now().toString() + Math.random();
    const newTab: ConsoleTab = {
      id,
      title,
      initialContent,
    };
    setConsoleTabs((prev) => [...prev, newTab]);
    setActiveConsoleId(id);
    // create ref for this console
    consoleRefs.current[id] = React.createRef<ConsoleRef>();
  };

  const closeConsole = (id: string) => {
    setConsoleTabs((prev) => prev.filter((tab) => tab.id !== id));
    // Cleanup ref
    delete consoleRefs.current[id];

    if (activeConsoleId === id) {
      const remaining = consoleTabs.filter((tab) => tab.id !== id);
      setActiveConsoleId(remaining.length ? remaining[0].id : null);
    }
  };

  const handleTabChange = (_event: React.SyntheticEvent, newValue: string) => {
    setActiveConsoleId(newValue);
  };

  // Attach double click handler to open console prefilled
  const handleCollectionDoubleClick = (collection: CollectionInfo) => {
    const prefill = `db.getCollection("${collection.name}").find({})`;
    openNewConsole(prefill, `Console - ${collection.name}`);
  };

  // Update current editor content periodically for Chat
  useEffect(() => {
    const updateEditorContent = () => {
      if (activeConsoleId && consoleRefs.current[activeConsoleId]?.current) {
        const content =
          consoleRefs.current[activeConsoleId].current!.getCurrentContent();
        setCurrentEditorContent(content);
      } else {
        setCurrentEditorContent(undefined);
      }
    };

    // Update immediately
    updateEditorContent();

    // Set up interval to check for content changes
    const interval = setInterval(updateEditorContent, 1000);

    return () => clearInterval(interval);
  }, [activeConsoleId, consoleTabs.length]);

  // Replace handleQueryExecute with handleConsoleExecute
  const handleConsoleExecute = async (query: string) => {
    if (!query.trim()) return;

    setIsExecuting(true);
    try {
      const response = await fetch(`/api/execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content: query }),
      });

      const data = await response.json();

      if (data.success) {
        setQueryResults(data.data);
      } else {
        console.error("Query execution failed:", data.error);
        setErrorMessage(JSON.stringify(data.error, null, 2));
        setErrorModalOpen(true);
      }
    } catch (error) {
      console.error("Failed to execute query:", error);
      setErrorMessage(JSON.stringify(error, null, 2));
      setErrorModalOpen(true);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleCollectionSelect = (
    collectionName: string,
    collection: CollectionInfo
  ) => {
    // If we're currently creating a new collection, exit creation mode first
    if (collectionEditorRef.current) {
      collectionEditorRef.current.cancelCreation?.();
    }

    setSelectedCollection(collectionName);
    setCollectionInfo(collection);
    setQueryResults(null); // Clear previous results
  };

  const handleCollectionCreate = async (collectionDefinition: any) => {
    setIsCreating(true);
    try {
      const response = await fetch("/api/database/collections", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(collectionDefinition),
      });

      const data = await response.json();

      if (data.success) {
        setSnackbarMessage(
          `Collection "${collectionDefinition.name}" created successfully`
        );
        setSnackbarOpen(true);
        setCreateDialogOpen(false);
        // Refresh the collection explorer
        setRefreshKey((prev) => prev + 1);
        // Select the newly created collection
        setSelectedCollection(collectionDefinition.name);
        setCollectionInfo({
          name: collectionDefinition.name,
          type: "collection",
          options: collectionDefinition.options || {},
          info: {},
        });
        setQueryResults(null);
      } else {
        console.error("Collection creation failed:", data.error);
        setErrorMessage(JSON.stringify(data.error, null, 2));
        setErrorModalOpen(true);
      }
    } catch (error) {
      console.error("Failed to create collection:", error);
      setErrorMessage(JSON.stringify(error, null, 2));
      setErrorModalOpen(true);
    } finally {
      setIsCreating(false);
    }
  };

  const handleCollectionDelete = async (collectionName: string) => {
    try {
      const response = await fetch(
        `/api/database/collections/${encodeURIComponent(collectionName)}`,
        {
          method: "DELETE",
        }
      );

      const data = await response.json();

      if (data.success) {
        setSnackbarMessage(
          `Collection "${collectionName}" deleted successfully`
        );
        setSnackbarOpen(true);
        // Clear the current selection
        setSelectedCollection("");
        setCollectionInfo(null);
        setQueryResults(null);
        // Refresh the collection explorer
        setRefreshKey((prev) => prev + 1);
      } else {
        console.error("Collection delete failed:", data.error);
        setErrorMessage(JSON.stringify(data.error, null, 2));
        setErrorModalOpen(true);
      }
    } catch (error) {
      console.error("Failed to delete collection:", error);
      setErrorMessage(JSON.stringify(error, null, 2));
      setErrorModalOpen(true);
    }
  };

  const handleCloseErrorModal = () => {
    setErrorModalOpen(false);
    setErrorMessage("");
  };

  const handleCloseSnackbar = () => {
    setSnackbarOpen(false);
    setSnackbarMessage("");
  };

  const handleCreateNewCollection = () => {
    // Clear current selection when creating a new collection
    setSelectedCollection("");
    setCollectionInfo(null);
    setQueryResults(null);

    // Open the creation dialog
    setCreateDialogOpen(true);
  };

  const handleCloseCreateDialog = () => {
    setCreateDialogOpen(false);
  };

  return (
    <Box
      sx={{
        height: "100%",
        width: "100%",
        maxWidth: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <PanelGroup
        direction="horizontal"
        style={{ height: "100%", width: "100%" }}
      >
        {/* Left Panel - Collection Explorer */}
        <Panel defaultSize={15}>
          <Box sx={{ height: "100%", overflow: "hidden" }}>
            <CollectionExplorer
              onCollectionSelect={(_name: string, _info: CollectionInfo) => {}}
              // highlight disabled for now
              selectedCollection={undefined}
              key={refreshKey}
              onCreateNew={handleCreateNewCollection}
              onCollectionDoubleClick={handleCollectionDoubleClick}
            />
          </Box>
        </Panel>

        <StyledHorizontalResizeHandle />

        {/* Middle Panel - Consoles and Results */}
        <Panel defaultSize={65} minSize={30}>
          <Box sx={{ height: "100%", overflow: "hidden" }}>
            <PanelGroup
              direction="vertical"
              style={{ height: "100%", width: "100%" }}
            >
              {/* Consoles */}
              <Panel defaultSize={50} minSize={1}>
                <Box
                  sx={{
                    height: "100%",
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  {consoleTabs.length > 0 ? (
                    <>
                      <Tabs
                        value={activeConsoleId}
                        onChange={handleTabChange}
                        variant="scrollable"
                        scrollButtons="auto"
                      >
                        {consoleTabs.map((tab) => (
                          <Tab
                            key={tab.id}
                            value={tab.id}
                            label={
                              <Box
                                sx={{ display: "flex", alignItems: "center" }}
                              >
                                <span>{tab.title}</span>
                                <IconButton
                                  size="small"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    closeConsole(tab.id);
                                  }}
                                >
                                  <CloseIcon fontSize="small" />
                                </IconButton>
                              </Box>
                            }
                          />
                        ))}
                      </Tabs>

                      {/* Active Console Editor */}
                      <Box sx={{ flexGrow: 1, overflow: "hidden" }}>
                        {consoleTabs.map((tab) => (
                          <Box
                            key={tab.id}
                            sx={{
                              height: "100%",
                              display:
                                activeConsoleId === tab.id ? "block" : "none",
                            }}
                          >
                            <Console
                              ref={consoleRefs.current[tab.id]}
                              initialContent={tab.initialContent}
                              title={tab.title}
                              onExecute={handleConsoleExecute}
                              isExecuting={isExecuting}
                            />
                          </Box>
                        ))}
                      </Box>
                    </>
                  ) : (
                    <Box
                      sx={{
                        height: "100%",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 2,
                      }}
                    >
                      <Typography>No console open</Typography>
                      <Button
                        variant="contained"
                        disableElevation
                        onClick={() => openNewConsole()}
                      >
                        Open Console
                      </Button>
                    </Box>
                  )}
                </Box>
              </Panel>

              <StyledVerticalResizeHandle />

              {/* Results */}
              <Panel defaultSize={50} minSize={1}>
                <Box sx={{ height: "100%", overflow: "hidden" }}>
                  <ResultsTable results={queryResults} />
                </Box>
              </Panel>
            </PanelGroup>
          </Box>
        </Panel>

        <StyledHorizontalResizeHandle />

        {/* Right Panel - ChatBot */}
        <Panel defaultSize={20} minSize={1}>
          <Box sx={{ height: "100%", overflow: "hidden" }}>
            <Chat currentEditorContent={currentEditorContent} />
          </Box>
        </Panel>
      </PanelGroup>

      {/* Create Collection Dialog */}
      <CreateCollectionDialog
        open={createDialogOpen}
        onClose={handleCloseCreateDialog}
        onCreateCollection={handleCollectionCreate}
        isCreating={isCreating}
      />

      {/* Error Modal */}
      <Dialog
        open={errorModalOpen}
        onClose={handleCloseErrorModal}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            maxHeight: "80vh",
          },
        }}
      >
        <DialogTitle
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Typography variant="h6" color="error">
            Operation Error
          </Typography>
          <IconButton
            aria-label="close"
            onClick={handleCloseErrorModal}
            sx={{
              color: (theme) => theme.palette.grey[500],
            }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Box
            component="pre"
            sx={{
              backgroundColor: "background.default",
              padding: 2,
              borderRadius: 1,
              overflow: "auto",
              fontFamily: "monospace",
              fontSize: "0.875rem",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {errorMessage}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={handleCloseErrorModal}
            variant="contained"
            disableElevation
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Success Snackbar */}
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={6000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert
          onClose={handleCloseSnackbar}
          severity="success"
          sx={{ width: "100%" }}
        >
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default Collections;
