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
  Alert,
  Snackbar,
} from "@mui/material";
import { Close as CloseIcon } from "@mui/icons-material";
import ViewExplorer from "../components/ViewExplorer";
import ViewEditor, { ViewEditorRef } from "../components/ViewEditor";
import ResultsTable from "../components/ResultsTable";
import Chat from "../components/Chat/Chat";
import { useWorkspace } from "../contexts/workspace-context";
// @ts-ignore – types will be available once the package is installed
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";

interface ViewDefinition {
  name: string;
  viewOn: string;
  pipeline: any[];
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

function Views() {
  const { currentWorkspace } = useWorkspace();
  const [views, setViews] = useState<ViewDefinition[]>([]);
  const [selectedView, setSelectedView] = useState<string>("");
  const [viewDefinition, setViewDefinition] = useState<ViewDefinition | null>(
    null
  );
  const [queryResults, setQueryResults] = useState<QueryResult | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
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
  const viewEditorRef = useRef<ViewEditorRef>(null);

  // Update current editor content periodically
  useEffect(() => {
    const updateEditorContent = () => {
      if (viewEditorRef.current) {
        const content = viewEditorRef.current.getCurrentContent();
        setCurrentEditorContent(content);
      }
    };

    // Update immediately
    updateEditorContent();

    // Set up interval to check for content changes
    const interval = setInterval(updateEditorContent, 1000);

    return () => clearInterval(interval);
  }, [selectedView, viewDefinition]);

  const handleViewSelect = (viewName: string, definition: ViewDefinition) => {
    // If we're currently creating a new view, exit creation mode first
    if (viewEditorRef.current) {
      // Reset the creation state in ViewEditor
      viewEditorRef.current.cancelCreation?.();
    }

    setSelectedView(viewName);
    setViewDefinition(definition);
    setQueryResults(null); // Clear previous results
  };

  const handleViewExecute = async (definition: ViewDefinition) => {
    if (
      !definition.viewOn ||
      !definition.pipeline ||
      !Array.isArray(definition.pipeline)
    ) {
      setErrorMessage("Invalid view definition: missing viewOn or pipeline");
      setErrorModalOpen(true);
      return;
    }

    setIsExecuting(true);
    try {
      // Try to execute the view's pipeline directly on the source collection
      // This approach avoids the namespace issues with the view info endpoint
      const queryContent = `
// Executing view: ${definition.name}
// Source collection: ${definition.viewOn}
// Pipeline:
db.${definition.viewOn}.aggregate(${JSON.stringify(
        definition.pipeline,
        null,
        2
      )})
      `.trim();

      const response = await fetch(`/api/execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content: queryContent }),
      });

      const data = await response.json();

      if (data.success) {
        setQueryResults(data.data);
      } else {
        console.error("View execution failed:", data.error);
        setErrorMessage(JSON.stringify(data.error, null, 2));
        setErrorModalOpen(true);
      }
    } catch (error) {
      console.error("Failed to execute view:", error);
      setErrorMessage(JSON.stringify(error, null, 2));
      setErrorModalOpen(true);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleViewSave = async (definition: ViewDefinition) => {
    setIsSaving(true);
    try {
      // Check if this is updating an existing view or creating a new one
      const isUpdate = selectedView === definition.name;

      if (isUpdate) {
        // Delete the existing view first, then create the new one
        await fetch(`/api/database/views/${encodeURIComponent(selectedView)}`, {
          method: "DELETE",
        });
      }

      // Create the view with the new definition
      const response = await fetch("/api/database/views", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(definition),
      });

      const data = await response.json();

      if (data.success) {
        setSnackbarMessage(`View "${definition.name}" saved successfully`);
        setSnackbarOpen(true);
        setSelectedView(definition.name);
        setViewDefinition(definition);
        // Refresh the view explorer
        setRefreshKey((prev) => prev + 1);
      } else {
        console.error("View save failed:", data.error);
        setErrorMessage(JSON.stringify(data.error, null, 2));
        setErrorModalOpen(true);
      }
    } catch (error) {
      console.error("Failed to save view:", error);
      setErrorMessage(JSON.stringify(error, null, 2));
      setErrorModalOpen(true);
    } finally {
      setIsSaving(false);
    }
  };

  const handleViewDelete = async (viewName: string) => {
    try {
      const response = await fetch(
        `/api/database/views/${encodeURIComponent(viewName)}`,
        {
          method: "DELETE",
        }
      );

      const data = await response.json();

      if (data.success) {
        setSnackbarMessage(`View "${viewName}" deleted successfully`);
        setSnackbarOpen(true);
        // Clear the current selection
        setSelectedView("");
        setViewDefinition(null);
        setQueryResults(null);
        // Refresh the view explorer
        setRefreshKey((prev) => prev + 1);
      } else {
        console.error("View delete failed:", data.error);
        setErrorMessage(JSON.stringify(data.error, null, 2));
        setErrorModalOpen(true);
      }
    } catch (error) {
      console.error("Failed to delete view:", error);
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

  const handleCreateNewView = () => {
    // Clear current selection when creating a new view
    setSelectedView("");
    setViewDefinition(null);
    setQueryResults(null);

    // Trigger creation mode in the editor
    viewEditorRef.current?.createNew();
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
        {/* Left Panel - View Explorer */}
        <Panel defaultSize={15}>
          <Box sx={{ height: "100%", overflow: "hidden" }}>
            <ViewExplorer
              onViewSelect={handleViewSelect}
              selectedView={selectedView}
              key={refreshKey} // Force refresh when key changes
              onCreateNew={handleCreateNewView}
            />
          </Box>
        </Panel>

        <StyledHorizontalResizeHandle />

        {/* Middle Panel - Editor and Results */}
        <Panel defaultSize={55} minSize={30}>
          <Box sx={{ height: "100%", overflow: "hidden" }}>
            <PanelGroup
              direction="vertical"
              style={{ height: "100%", width: "100%" }}
            >
              {/* View Editor */}
              <Panel defaultSize={50} minSize={1}>
                <Box sx={{ height: "100%", overflow: "hidden" }}>
                  <ViewEditor
                    viewDefinition={viewDefinition}
                    selectedView={selectedView}
                    onExecute={handleViewExecute}
                    onSave={handleViewSave}
                    onDelete={handleViewDelete}
                    isExecuting={isExecuting}
                    isSaving={isSaving}
                    ref={viewEditorRef}
                  />
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
        <Panel defaultSize={30} minSize={1}>
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

export default Views;
