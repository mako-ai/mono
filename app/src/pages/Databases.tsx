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
import DatabaseExplorer from "../components/DatabaseExplorer";
import ResultsTable from "../components/ResultsTable";
import Chat from "../components/Chat/Chat";
// @ts-ignore – types will be available once the package is installed
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import Console, { ConsoleRef } from "../components/Console";
import { useConsoleStore } from "../store/consoleStore";

interface CollectionInfo {
  name: string;
  type: string;
  options: any;
}

interface QueryResult {
  results: any[];
  executedAt: string;
  resultCount: number;
}

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

function Databases() {
  const [queryResults, setQueryResults] = useState<QueryResult | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorModalOpen, setErrorModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState("");
  const [currentEditorContent, setCurrentEditorContent] = useState<
    | {
        content: string;
        fileName?: string;
        language?: string;
      }
    | undefined
  >(undefined);
  const [availableDatabases, setAvailableDatabases] = useState<Database[]>([]);

  // Use Zustand store for console tabs
  const {
    consoleTabs,
    activeConsoleId,
    addConsoleTab,
    removeConsoleTab,
    updateConsoleContent,
    updateConsoleDatabase,
    setActiveConsole,
  } = useConsoleStore();

  const consoleRefs = useRef<Record<string, React.RefObject<ConsoleRef>>>({});

  // Initialize refs for existing console tabs
  useEffect(() => {
    consoleTabs.forEach((tab) => {
      if (!consoleRefs.current[tab.id]) {
        consoleRefs.current[tab.id] = React.createRef<ConsoleRef>();
      }
    });
  }, [consoleTabs]);

  const openNewConsole = (
    initialContent: string = "",
    title: string = "New Console",
    databaseId?: string
  ) => {
    const id = addConsoleTab({
      title,
      content: initialContent,
      initialContent,
      databaseId,
    });
    // create ref for this console
    consoleRefs.current[id] = React.createRef<ConsoleRef>();
  };

  const closeConsole = (id: string) => {
    removeConsoleTab(id);
    // Cleanup ref
    delete consoleRefs.current[id];
  };

  const handleTabChange = (_event: React.SyntheticEvent, newValue: string) => {
    setActiveConsole(newValue);
  };

  // Attach click handler to open console prefilled
  const handleCollectionClick = (
    databaseId: string,
    collection: CollectionInfo
  ) => {
    const prefill = `db.${collection.name}.find({})`;
    openNewConsole(prefill, collection.name, databaseId);
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

  // Fetch available databases on mount
  useEffect(() => {
    const fetchDatabases = async () => {
      try {
        const response = await fetch("/api/databases/servers");
        const data = await response.json();

        if (data.success) {
          // Extract all databases from all servers
          const allDatabases: Database[] = [];
          data.data.forEach((server: Server) => {
            allDatabases.push(...server.databases);
          });
          setAvailableDatabases(allDatabases);
        }
      } catch (error) {
        console.error("Failed to fetch databases:", error);
      }
    };

    fetchDatabases();
  }, []);

  // Replace handleQueryExecute with handleConsoleExecute
  const handleConsoleExecute = async (query: string, databaseId?: string) => {
    if (!query.trim()) return;

    setIsExecuting(true);
    try {
      const response = await fetch(`/api/execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: query,
          databaseId: databaseId,
        }),
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

  const handleConsoleSaveInDatabasePage = async (
    contentToSave: string,
    _currentPath?: string
  ): Promise<boolean> => {
    // In Databases page, save is always "Save As" to the main consoles directory
    setIsSaving(true);
    let success = false;
    try {
      const fileName = prompt(
        "Enter a file name to save this console (e.g., myFolder/myQuery). Existing .js extension will be appended if not present."
      );
      if (!fileName) {
        setIsSaving(false);
        return false; // User cancelled
      }
      // API expects path without .js, remove if user added it
      const savePath = fileName.endsWith(".js")
        ? fileName.substring(0, fileName.length - 3)
        : fileName;

      const response = await fetch(`/api/consoles`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ path: savePath, content: contentToSave }),
      });

      const data = await response.json();

      if (data.success) {
        // alert("Console saved successfully as " + savePath + ".js!"); // Simple feedback
        // Optionally, we could switch to the Consoles page and open this newly saved console.
        // For now, just confirm save and stay on Databases page.
        // We might also want to update the console tab title if it was a temporary one.
        setSnackbarMessage(`Console saved as '${savePath}.js'`);
        setSnackbarOpen(true);
        success = true;
      } else {
        console.error("Console save failed:", data.error);
        setErrorMessage(JSON.stringify(data.error, null, 2));
        setErrorModalOpen(true);
        success = false;
      }
    } catch (error) {
      console.error("Failed to save console:", error);
      setErrorMessage(JSON.stringify(error, null, 2));
      setErrorModalOpen(true);
      success = false;
    } finally {
      setIsSaving(false);
    }
    // Returning true here indicates a new path was created (which is always the case for this function)
    // This might be used by the Console component to reset its filePath if that feature is built out.
    return success;
  };

  const handleCloseErrorModal = () => {
    setErrorModalOpen(false);
    setErrorMessage("");
  };

  const handleCloseSnackbar = () => {
    setSnackbarOpen(false);
    setSnackbarMessage("");
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
        {/* Left Panel - Database Explorer */}
        <Panel defaultSize={15}>
          <Box sx={{ height: "100%", overflow: "hidden" }}>
            <DatabaseExplorer onCollectionClick={handleCollectionClick} />
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
                              initialContent={tab.content}
                              title={tab.title}
                              onExecute={handleConsoleExecute}
                              isExecuting={isExecuting}
                              onSave={handleConsoleSaveInDatabasePage}
                              isSaving={isSaving}
                              onContentChange={(content) =>
                                updateConsoleContent(tab.id, content)
                              }
                              databases={availableDatabases}
                              initialDatabaseId={tab.databaseId}
                              onDatabaseChange={() =>
                                updateConsoleDatabase(tab.id)
                              }
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

export default Databases;
