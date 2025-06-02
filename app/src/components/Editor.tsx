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
import { Close as CloseIcon } from "@mui/icons-material";
// @ts-ignore – types will be available once the package is installed
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import Console, { ConsoleRef } from "./Console";
import ResultsTable from "./ResultsTable";
import Settings from "../pages/Settings";
import DataSources from "../pages/DataSources";
import { useConsoleStore } from "../store/consoleStore";
import { useAppStore } from "../store";

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
      localId: string;
      name: string;
      description: string;
      database: string;
      active: boolean;
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
    setActiveConsole,
  } = useConsoleStore();

  // Refs for each Console instance
  const consoleRefs = useRef<Record<string, React.RefObject<ConsoleRef>>>({});

  // Ensure refs exist for every tab
  useEffect(() => {
    consoleTabs.forEach((tab) => {
      if (!consoleRefs.current[tab.id]) {
        consoleRefs.current[tab.id] = React.createRef<ConsoleRef>();
      }
    });
  }, [consoleTabs]);

  // Keep activeEditorContent in app store updated so Chat can use it
  const setActiveEditorContent = useAppStore(
    (state) => state.setActiveEditorContent
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

  // Fetch databases once
  useEffect(() => {
    const fetchDatabases = async () => {
      try {
        const response = await fetch("/api/databases/servers");
        const data = await response.json();
        if (data.success) {
          const all: typeof availableDatabases = [];
          data.data.forEach((srv: any) => {
            all.push(...srv.databases);
          });
          setAvailableDatabases(all);
        }
      } catch (e) {
        console.error("Failed to fetch databases list", e);
      }
    };
    fetchDatabases();
  }, []);

  /* ------------------------ Console Actions ------------------------ */
  const handleTabChange = (_: React.SyntheticEvent, newValue: string) => {
    setActiveConsole(newValue);
  };

  const closeConsole = (id: string) => {
    removeConsoleTab(id);
    delete consoleRefs.current[id];
  };

  const handleConsoleExecute = async (
    tabId: string,
    contentToExecute: string,
    databaseId?: string
  ) => {
    if (!contentToExecute.trim()) return;
    setIsExecuting(true);
    try {
      const response = await fetch(`/api/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: contentToExecute, databaseId }),
      });
      const data = await response.json();
      if (data.success) {
        setTabResults((prev) => ({ ...prev, [tabId]: data.data }));
      } else {
        setErrorMessage(JSON.stringify(data.error, null, 2));
        setErrorModalOpen(true);
        setTabResults((prev) => ({ ...prev, [tabId]: null }));
      }
    } catch (e: any) {
      setErrorMessage(JSON.stringify(e, null, 2));
      setErrorModalOpen(true);
      setTabResults((prev) => ({ ...prev, [tabId]: null }));
    } finally {
      setIsExecuting(false);
    }
  };

  const handleConsoleSave = async (
    tabId: string,
    contentToSave: string,
    currentPath?: string
  ): Promise<boolean> => {
    setIsSaving(true);
    let success = false;
    try {
      let savePath = currentPath;
      let method = "PUT";
      if (!savePath) {
        const fileName = prompt(
          "Enter a file name to save (e.g., myFolder/myConsole). .js will be appended if absent."
        );
        if (!fileName) {
          setIsSaving(false);
          return false;
        }
        savePath = fileName.endsWith(".js") ? fileName.slice(0, -3) : fileName;
        method = "POST";
      }
      const response = await fetch(
        method === "PUT" ? `/api/consoles/${savePath}` : `/api/consoles`,
        {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            method === "POST"
              ? { path: savePath, content: contentToSave }
              : { content: contentToSave }
          ),
        }
      );
      const data = await response.json();
      if (data.success) {
        // Update file path in tab if we just created a new file (POST)
        if (method === "POST" && savePath) {
          updateConsoleFilePath(tabId, savePath);
          updateConsoleTitle(tabId, `Console: ${savePath}`);
        }
        setSnackbarMessage(
          `Console saved ${method === "POST" ? "as" : "to"} '${savePath}.js'`
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
                  <Box sx={{ display: "flex", alignItems: "center" }}>
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

          {/* Editor + Results vertical split */}
          <Box sx={{ flexGrow: 1, overflow: "hidden" }}>
            {(() => {
              const activeTab = consoleTabs.find(
                (t) => t.id === activeConsoleId
              );
              const isConsoleTab =
                activeTab?.kind !== "settings" && activeTab?.kind !== "sources";

              if (isConsoleTab) {
                return (
                  <PanelGroup
                    direction="vertical"
                    style={{ height: "100%", width: "100%" }}
                  >
                    <Panel defaultSize={60} minSize={1}>
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
                            onExecute={(content, db) =>
                              handleConsoleExecute(tab.id, content, db)
                            }
                            onSave={(content, currentPath) =>
                              handleConsoleSave(tab.id, content, currentPath)
                            }
                            isExecuting={isExecuting}
                            isSaving={isSaving}
                            onContentChange={(content) =>
                              updateConsoleContent(tab.id, content)
                            }
                            initialDatabaseId={tab.databaseId}
                            databases={availableDatabases}
                            onDatabaseChange={(dbId) =>
                              updateConsoleDatabase(tab.id, dbId)
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
                            activeTab ? tabResults[activeTab.id] || null : null
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
                      ) : (
                        <DataSources />
                      )}
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
                title: "Console",
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
