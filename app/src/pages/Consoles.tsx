import { useState, useRef, useEffect } from "react";
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
} from "@mui/material";
import { Close as CloseIcon } from "@mui/icons-material";
import ConsoleExplorer, {
  ConsoleExplorerRef,
} from "../components/ConsoleExplorer";
import Console, { ConsoleRef } from "../components/Console";
import ResultsTable from "../components/ResultsTable";
import Chat from "../components/Chat/Chat";
// @ts-ignore – types will be available once the package is installed
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";

interface ConsoleResult {
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

function Consoles() {
  const [selectedConsole, setSelectedConsole] = useState<string>("");
  const [consoleContent, setConsoleContent] = useState<string>("");
  const [consoleResults, setConsoleResults] = useState<ConsoleResult | null>(
    null
  );
  const [isExecuting, setIsExecuting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorModalOpen, setErrorModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [currentEditorContent, setCurrentEditorContent] = useState<
    | {
        content: string;
        fileName?: string;
        language?: string;
      }
    | undefined
  >(undefined);
  const consoleEditorRef = useRef<ConsoleRef>(null);
  const consoleExplorerRef = useRef<ConsoleExplorerRef>(null);

  // Update current editor content periodically
  useEffect(() => {
    const updateEditorContent = () => {
      if (consoleEditorRef.current) {
        const content = consoleEditorRef.current.getCurrentContent();
        setCurrentEditorContent(content);
      }
    };

    // Update immediately
    updateEditorContent();

    // Set up interval to check for content changes
    const interval = setInterval(updateEditorContent, 1000);

    return () => clearInterval(interval);
  }, [selectedConsole, consoleContent]);

  const handleConsoleSelect = (consolePath: string, content: string) => {
    setSelectedConsole(consolePath);
    setConsoleContent(content);
    setConsoleResults(null); // Clear previous results
  };

  const handleConsoleExecute = async (contentToExecute: string) => {
    if (!contentToExecute.trim()) return;

    setIsExecuting(true);
    try {
      const response = await fetch(`/api/execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content: contentToExecute }),
      });

      const data = await response.json();

      if (data.success) {
        setConsoleResults(data.data);
      } else {
        console.error("Console execution failed:", data.error);
        setErrorMessage(JSON.stringify(data.error, null, 2));
        setErrorModalOpen(true);
      }
    } catch (error) {
      console.error("Failed to execute console:", error);
      setErrorMessage(JSON.stringify(error, null, 2));
      setErrorModalOpen(true);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleConsoleSave = async (
    contentToSave: string,
    currentPath?: string
  ): Promise<boolean> => {
    setIsSaving(true);
    let success = false;
    let newPathCreated = false;

    try {
      let savePath = currentPath;
      let method = "PUT";

      if (!savePath) {
        // New console or "Save As" scenario
        const fileName = prompt(
          "Enter a file name for the console (e.g., myFolder/myConsole). Existing .js extension will be appended if not present."
        );
        if (!fileName) {
          setIsSaving(false);
          return false; // User cancelled
        }
        savePath = fileName.endsWith(".js")
          ? fileName.substring(0, fileName.length - 3)
          : fileName; // API expects path without .js
        method = "POST";
        newPathCreated = true;
      }

      const response = await fetch(
        method === "PUT" ? `/api/consoles/${savePath}` : `/api/consoles`,
        {
          method: method,
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(
            method === "POST"
              ? { path: savePath, content: contentToSave }
              : { content: contentToSave }
          ),
        }
      );

      const data = await response.json();

      if (data.success) {
        // alert("Console saved successfully!"); // Simple feedback, can be improved
        setConsoleContent(contentToSave); // Ensure editor content is up-to-date
        if (method === "POST" && data.data && data.data.path) {
          setSelectedConsole(data.data.path); // Update selected console to the new path
          // Refresh ConsoleExplorer to show the new file
          if (consoleExplorerRef.current) {
            consoleExplorerRef.current.refresh();
          }
        }
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
    return newPathCreated && success;
  };

  const handleCloseErrorModal = () => {
    setErrorModalOpen(false);
    setErrorMessage("");
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
        {/* Left Panel - Console Explorer */}
        <Panel defaultSize={15}>
          <Box sx={{ height: "100%", overflow: "hidden" }}>
            <ConsoleExplorer
              onConsoleSelect={handleConsoleSelect}
              ref={consoleExplorerRef}
            />
          </Box>
        </Panel>

        <StyledHorizontalResizeHandle />

        {/* Middle Panel - Editor and Results */}
        <Panel defaultSize={65} minSize={30}>
          <Box sx={{ height: "100%", overflow: "hidden" }}>
            <PanelGroup
              direction="vertical"
              style={{ height: "100%", width: "100%" }}
            >
              {/* Console Editor */}
              <Panel defaultSize={50} minSize={1}>
                <Box sx={{ height: "100%", overflow: "hidden" }}>
                  <Console
                    initialContent={consoleContent}
                    title={
                      selectedConsole
                        ? `Console: ${selectedConsole}`
                        : "Console"
                    }
                    onExecute={handleConsoleExecute}
                    onSave={handleConsoleSave}
                    isExecuting={isExecuting}
                    isSaving={isSaving}
                    ref={consoleEditorRef}
                    filePath={selectedConsole}
                  />
                </Box>
              </Panel>

              <StyledVerticalResizeHandle />

              {/* Results */}
              <Panel defaultSize={50} minSize={1}>
                <Box sx={{ height: "100%", overflow: "hidden" }}>
                  <ResultsTable results={consoleResults} />
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
            Console Execution Error
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
    </Box>
  );
}

export default Consoles;
