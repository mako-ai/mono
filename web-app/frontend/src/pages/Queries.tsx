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
import QueryExplorer from "../components/QueryExplorer";
import QueryEditor, { QueryEditorRef } from "../components/QueryEditor";
import ResultsTable from "../components/ResultsTable";
import ChatBot from "../components/ChatBot";
// @ts-ignore – types will be available once the package is installed
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";

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

function Queries() {
  const [selectedQuery, setSelectedQuery] = useState<string>("");
  const [queryContent, setQueryContent] = useState<string>("");
  const [queryResults, setQueryResults] = useState<QueryResult | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
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
  const queryEditorRef = useRef<QueryEditorRef>(null);

  // Update current editor content periodically
  useEffect(() => {
    const updateEditorContent = () => {
      if (queryEditorRef.current) {
        const content = queryEditorRef.current.getCurrentContent();
        setCurrentEditorContent(content);
      }
    };

    // Update immediately
    updateEditorContent();

    // Set up interval to check for content changes
    const interval = setInterval(updateEditorContent, 1000);

    return () => clearInterval(interval);
  }, [selectedQuery, queryContent]);

  const handleQuerySelect = (queryPath: string, content: string) => {
    setSelectedQuery(queryPath);
    setQueryContent(content);
    setQueryResults(null); // Clear previous results
  };

  const handleQueryExecute = async (queryContent: string) => {
    if (!queryContent.trim()) return;

    setIsExecuting(true);
    try {
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
        {/* Left Panel - Query Explorer */}
        <Panel defaultSize={15}>
          <Box sx={{ height: "100%", overflow: "hidden" }}>
            <QueryExplorer onQuerySelect={handleQuerySelect} />
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
              {/* Query Editor */}
              <Panel defaultSize={50} minSize={1}>
                <Box sx={{ height: "100%", overflow: "hidden" }}>
                  <QueryEditor
                    queryContent={queryContent}
                    selectedQuery={selectedQuery}
                    onExecute={handleQueryExecute}
                    isExecuting={isExecuting}
                    ref={queryEditorRef}
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
          <Box sx={{ height: "100%", overflow: "hidden" }}>
            <ChatBot currentEditorContent={currentEditorContent} />
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
            Query Execution Error
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
    </Box>
  );
}

export default Queries;
