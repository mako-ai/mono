import React, { useRef, useEffect, useState } from "react";
import {
  Box,
  Tabs,
  Tab,
  IconButton,
  Button,
  Typography,
  styled,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Snackbar,
} from "@mui/material";
import { Close as CloseIcon, Add as AddIcon } from "@mui/icons-material";
import { SquareTerminal as ConsoleIcon } from "lucide-react";
// @ts-ignore – types will be available once the package is installed
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import Console, { ConsoleRef } from "./Console";
import ResultsTable from "./ResultsTable";
import Settings from "../pages/Settings";
import DataSources from "../pages/DataSources";
import { WorkspaceMembers } from "./WorkspaceMembers";
import { useConsoleStore } from "../store/consoleStore";
import { useAppStore } from "../store";
import { useWorkspace } from "../contexts/workspace-context";

interface QueryResult {
  results: any[];
  executedAt: string;
  resultCount: number;
}

// Styled PanelResizeHandle components
const StyledVerticalResizeHandle = styled(PanelResizeHandle)(({ theme }) => ({
  height: "4px",
  background: theme.palette.divider,
  cursor: "row-resize",
  transition: "background-color 0.2s ease",
  "&:hover": {
    backgroundColor: theme.palette.primary.main,
  },
}));

function Editor() {
  const { currentWorkspace } = useWorkspace();
  const [tabResults, setTabResults] = useState<
    Record<string, QueryResult | null>
  >({});
  const [isExecuting, setIsExecuting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorModalOpen, setErrorModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState("");
  const [availableDatabases, setAvailableDatabases] = useState<
    {
      id: string;
      name: string;
      description: string;
      database: string;
      type: string;
      active: boolean;
      lastConnectedAt?: string;
      connection: {
        host?: string;
        port?: number;
        connectionString?: string;
      };
      displayName: string;
      hostKey: string;
      hostName: string;
    }[]
  >([]);

  // Tab store
  const {
    consoleTabs,
    activeConsoleId,
    removeConsoleTab,
    updateConsoleContent,
    updateConsoleDatabase,
    updateConsoleFilePath,
    updateConsoleTitle,
    updateConsoleDirty,
    setActiveConsole,
  } = useConsoleStore();

  // Refs for each Console instance
  const consoleRefs = useRef<Record<string, React.RefObject<ConsoleRef>>>({});

  // Ensure refs exist for every tab
  useEffect(() => {
    consoleTabs.forEach(tab => {
      if (!consoleRefs.current[tab.id]) {
        consoleRefs.current[tab.id] = React.createRef<ConsoleRef>();
      }
    });
  }, [consoleTabs]);

  // Keep activeEditorContent in app store updated so Chat can use it
  const setActiveEditorContent = useAppStore(
    state => state.setActiveEditorContent,
  );

  useEffect(() => {
    const updateContent = () => {
      if (activeConsoleId && consoleRefs.current[activeConsoleId]?.current) {
        const content =
          consoleRefs.current[activeConsoleId].current!.getCurrentContent();
        setActiveEditorContent(content);
      } else {
        setActiveEditorContent(undefined);
      }
    };

    updateContent();
    const interval = setInterval(updateContent, 1000);
    return () => clearInterval(interval);
  }, [activeConsoleId, consoleTabs.length, setActiveEditorContent]);

  // Fetch databases when workspace changes
  useEffect(() => {
    const fetchDatabases = async () => {
      if (!currentWorkspace) return;

      try {
        const response = await fetch(
          `/api/workspaces/${currentWorkspace.id}/databases`,
        );
        const data = await response.json();
        if (data.success) {
          // Use the databases directly from the new API structure
          setAvailableDatabases(data.data);
        }
      } catch (e) {
        console.error("Failed to fetch databases list", e);
      }
    };
    fetchDatabases();
  }, [currentWorkspace]);

  /* ------------------------ Console Actions ------------------------ */
  const handleTabChange = (_: React.SyntheticEvent, newValue: string) => {
    setActiveConsole(newValue);
  };

  const closeConsole = (id: string) => {
    removeConsoleTab(id);
    delete consoleRefs.current[id];
  };

  const handleAddTab = () => {
    useConsoleStore.getState().addConsoleTab({
      title: "New Console",
      content: "",
      initialContent: "",
    });
  };

  const handleConsoleExecute = async (
    tabId: string,
    contentToExecute: string,
    databaseId?: string,
  ) => {
    if (!contentToExecute.trim()) return;

    if (!currentWorkspace) {
      setErrorMessage("No workspace selected");
      setErrorModalOpen(true);
      return;
    }

    if (!databaseId) {
      setErrorMessage("No database selected");
      setErrorModalOpen(true);
      return;
    }

    setIsExecuting(true);
    try {
      const response = await fetch(
        `/api/workspaces/${currentWorkspace.id}/databases/${databaseId}/execute`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: contentToExecute }),
        },
      );
      const data = await response.json();
      if (data.success) {
        setTabResults(prev => ({
          ...prev,
          [tabId]: {
            results: data.data,
            executedAt: new Date().toISOString(),
            resultCount: Array.isArray(data.data) ? data.data.length : 1,
          },
        }));
      } else {
        setErrorMessage(JSON.stringify(data.error, null, 2));
        setErrorModalOpen(true);
        setTabResults(prev => ({ ...prev, [tabId]: null }));
      }
    } catch (e: any) {
      setErrorMessage(JSON.stringify(e, null, 2));
      setErrorModalOpen(true);
      setTabResults(prev => ({ ...prev, [tabId]: null }));
    } finally {
      setIsExecuting(false);
    }
  };

  const handleConsoleSave = async (
    tabId: string,
    contentToSave: string,
    currentPath?: string,
  ): Promise<boolean> => {
    if (!currentWorkspace) {
      setErrorMessage("No workspace selected");
      setErrorModalOpen(true);
      return false;
    }

    setIsSaving(true);
    let success = false;
    try {
      let savePath = currentPath;
      let method = "PUT";
      if (!savePath) {
        const fileName = prompt(
          "Enter a file name to save (e.g., myFolder/myConsole). .js will be appended if absent.",
        );
        if (!fileName) {
          setIsSaving(false);
          return false;
        }
        savePath = fileName.endsWith(".js") ? fileName.slice(0, -3) : fileName;
        method = "POST";
      }
      const response = await fetch(
        method === "PUT"
          ? `/api/workspaces/${currentWorkspace.id}/consoles/${savePath}`
          : `/api/workspaces/${currentWorkspace.id}/consoles`,
        {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            method === "POST"
              ? { path: savePath, content: contentToSave }
              : { content: contentToSave },
          ),
        },
      );
      const data = await response.json();
      if (data.success) {
        // Update file path and title for new files (POST)
        if (method === "POST" && savePath) {
          updateConsoleFilePath(tabId, savePath);
        }

        // Always update the title to reflect the filename after saving
        if (savePath) {
          const fileName = savePath.split("/").pop() || savePath; // Extract filename from path
          updateConsoleTitle(tabId, fileName);
        }

        // Mark tab as dirty since it's now saved and should be persistent
        updateConsoleDirty(tabId, true);

        setSnackbarMessage(
          `Console saved ${method === "POST" ? "as" : "to"} '${savePath}.js'`,
        );
        setSnackbarOpen(true);
        success = true;
      } else {
        setErrorMessage(JSON.stringify(data.error, null, 2));
        setErrorModalOpen(true);
      }
    } catch (e: any) {
      setErrorMessage(JSON.stringify(e, null, 2));
      setErrorModalOpen(true);
    } finally {
      setIsSaving(false);
    }
    return success;
  };

  const handleCloseErrorModal = () => {
    setErrorModalOpen(false);
    setErrorMessage("");
  };

  const handleCloseSnackbar = () => {
    setSnackbarOpen(false);
  };

  /* ----------------------------- Render ---------------------------- */
  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {consoleTabs.length > 0 ? (
        <Box
          sx={{
            height: "100%",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Tabs */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              borderBottom: 1,
              borderColor: "divider",
            }}
          >
            <Tabs
              value={activeConsoleId}
              onChange={handleTabChange}
              variant="scrollable"
              scrollButtons="auto"
            >
              {consoleTabs.map(tab => (
                <Tab
                  key={tab.id}
                  value={tab.id}
                  label={
                    <Box
                      sx={{ display: "flex", alignItems: "center", gap: 0.75 }}
                    >
                      <ConsoleIcon size={20} />
                      <span
                        style={{
                          fontStyle: tab.isDirty ? "normal" : "italic",
                        }}
                        onDoubleClick={e => {
                          e.stopPropagation();
                          updateConsoleDirty(tab.id, true);
                        }}
                      >
                        {tab.title}
                      </span>
                      <IconButton
                        size="small"
                        onClick={e => {
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
            <IconButton
              onClick={handleAddTab}
              size="small"
              sx={{ ml: 1, mr: 1 }}
              title="Add new console tab"
            >
              <AddIcon />
            </IconButton>
          </Box>

          {/* Editor + Results vertical split */}
          <Box sx={{ flexGrow: 1, overflow: "hidden" }}>
            {(() => {
              const activeTab = consoleTabs.find(t => t.id === activeConsoleId);
              const isConsoleTab =
                activeTab?.kind !== "settings" &&
                activeTab?.kind !== "sources" &&
                activeTab?.kind !== "members";

              if (isConsoleTab) {
                return (
                  <PanelGroup
                    direction="vertical"
                    style={{ height: "100%", width: "100%" }}
                  >
                    <Panel defaultSize={60} minSize={1}>
                      {consoleTabs.map(tab => (
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
                            onExecute={(content, db) =>
                              handleConsoleExecute(tab.id, content, db)
                            }
                            onSave={(content, currentPath) =>
                              handleConsoleSave(tab.id, content, currentPath)
                            }
                            isExecuting={isExecuting}
                            isSaving={isSaving}
                            onContentChange={content => {
                              updateConsoleContent(tab.id, content);
                              // Mark tab as dirty when content changes from initial
                              if (
                                content !== tab.initialContent &&
                                !tab.isDirty
                              ) {
                                updateConsoleDirty(tab.id, true);
                              }
                            }}
                            initialDatabaseId={tab.databaseId}
                            databases={availableDatabases}
                            onDatabaseChange={() =>
                              updateConsoleDatabase(tab.id)
                            }
                            filePath={tab.filePath}
                          />
                        </Box>
                      ))}
                    </Panel>

                    <StyledVerticalResizeHandle />

                    <Panel defaultSize={40} minSize={1}>
                      <Box sx={{ height: "100%", overflow: "hidden" }}>
                        <ResultsTable
                          results={
                            activeTab?.id
                              ? tabResults[activeTab.id] || null
                              : null
                          }
                        />
                      </Box>
                    </Panel>
                  </PanelGroup>
                );
              }

              // Non-console tab (settings or sources) – render full height without results panel
              return (
                <PanelGroup
                  direction="vertical"
                  style={{ height: "100%", width: "100%" }}
                >
                  <Panel>
                    <Box sx={{ height: "100%", overflow: "auto" }}>
                      {activeTab?.kind === "settings" ? (
                        <Settings />
                      ) : activeTab?.kind === "sources" ? (
                        <DataSources />
                      ) : activeTab?.kind === "members" ? (
                        <WorkspaceMembers />
                      ) : null}
                    </Box>
                  </Panel>
                </PanelGroup>
              );
            })()}
          </Box>
        </Box>
      ) : (
        <Box
          sx={{
            flexGrow: 1,
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
            onClick={() => {
              // Add a blank tab on demand
              useConsoleStore.getState().addConsoleTab({
                title: "New Console",
                content: "",
                initialContent: "",
              });
            }}
          >
            Open Console
          </Button>
        </Box>
      )}

      {/* Error Modal */}
      <Dialog
        open={errorModalOpen}
        onClose={handleCloseErrorModal}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { maxHeight: "80vh" } }}
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
          <IconButton aria-label="close" onClick={handleCloseErrorModal}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Box component="pre" sx={{ p: 2, overflow: "auto" }}>
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

export default Editor;
