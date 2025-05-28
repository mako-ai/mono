import { useState } from "react";
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
import ViewEditor from "../components/ViewEditor";
import ResultsTable from "../components/ResultsTable";
import CreateViewDialog from "../components/CreateViewDialog";
import ChatBot from "../components/ChatBot";
// @ts-ignore – types will be available once the package is installed
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";

interface ViewDefinition {
  name: string;
  viewOn: string;
  pipeline: any[];
  options?: any;
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
  const [selectedView, setSelectedView] = useState<string>("");
  const [viewDefinition, setViewDefinition] = useState<ViewDefinition | null>(
    null
  );
  const [queryResults, setQueryResults] = useState<QueryResult | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [errorModalOpen, setErrorModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const handleViewSelect = (viewName: string, definition: ViewDefinition) => {
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

  const handleCreateView = async (definition: ViewDefinition) => {
    setIsCreating(true);
    try {
      const response = await fetch("/api/database/views", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(definition),
      });

      const data = await response.json();

      if (data.success) {
        setSnackbarMessage(`View "${definition.name}" created successfully`);
        setSnackbarOpen(true);
        setCreateDialogOpen(false);
        setSelectedView(definition.name);
        setViewDefinition(definition);
        // Refresh the view explorer
        setRefreshKey((prev) => prev + 1);
      } else {
        console.error("View creation failed:", data.error);
        setErrorMessage(JSON.stringify(data.error, null, 2));
        setErrorModalOpen(true);
      }
    } catch (error) {
      console.error("Failed to create view:", error);
      setErrorMessage(JSON.stringify(error, null, 2));
      setErrorModalOpen(true);
    } finally {
      setIsCreating(false);
    }
  };

  const handleCreateNewView = () => {
    setCreateDialogOpen(true);
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
        {/* Left Panel - View Explorer */}
        <Panel defaultSize={15}>
          <Box sx={{ height: "100%", overflow: "hidden" }}>
            <ViewExplorer
              onViewSelect={handleViewSelect}
              selectedView={selectedView}
              key={refreshKey} // Force refresh when key changes
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
              {/* View Editor */}
              <Panel defaultSize={50} minSize={1}>
                <Box sx={{ height: "100%", overflow: "hidden" }}>
                  <ViewEditor
                    viewDefinition={viewDefinition}
                    selectedView={selectedView}
                    onExecute={handleViewExecute}
                    onSave={handleViewSave}
                    onCreate={handleCreateNewView}
                    isExecuting={isExecuting}
                    isSaving={isSaving}
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
        <Panel defaultSize={20} minSize={1}>
          <Box sx={{ height: "100%", overflow: "hidden", p: 1 }}>
            <Typography variant="h6" gutterBottom>
              AI Assistant
            </Typography>
            <ChatBot />
          </Box>
        </Panel>
      </PanelGroup>

      {/* Create View Dialog */}
      <CreateViewDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        onCreateView={handleCreateView}
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
          <Button onClick={handleCloseErrorModal} variant="contained">
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
