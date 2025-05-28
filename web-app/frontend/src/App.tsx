import { useState } from "react";
import { Box, Typography, styled, AppBar, Toolbar } from "@mui/material";
import QueryExplorer from "./components/QueryExplorer";
import QueryEditor from "./components/QueryEditor";
import ResultsTable from "./components/ResultsTable";
import ChatBot from "./components/ChatBot";
import ThemeSelector from "./components/ThemeSelector";
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

function App() {
  const [selectedQuery, setSelectedQuery] = useState<string>("");
  const [queryContent, setQueryContent] = useState<string>("");
  const [queryResults, setQueryResults] = useState<QueryResult | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);

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
        // TODO: Show error in UI
      }
    } catch (error) {
      console.error("Failed to execute query:", error);
      // TODO: Show error in UI
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <Box
      sx={{
        flexGrow: 1,
        height: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header with Theme Selector */}
      <AppBar
        position="static"
        color="transparent"
        elevation={0}
        sx={{ borderBottom: 1, borderColor: "divider" }}
      >
        <Toolbar
          sx={{ justifyContent: "space-between", minHeight: "48px !important" }}
        >
          <Typography variant="h6" component="div">
            RevOps Query Explorer
          </Typography>
          <ThemeSelector />
        </Toolbar>
      </AppBar>

      {/* Main Content */}
      <Box sx={{ flexGrow: 1, height: "calc(100vh - 48px)" }}>
        <PanelGroup direction="horizontal" style={{ height: "100%" }}>
          {/* Left Panel - Query Explorer */}
          <Panel defaultSize={20} minSize={1}>
            <QueryExplorer onQuerySelect={handleQuerySelect} />
          </Panel>

          <StyledHorizontalResizeHandle />

          {/* Middle Panel - Editor and Results */}
          <Panel defaultSize={50} minSize={30}>
            <PanelGroup direction="vertical" style={{ height: "100%" }}>
              {/* Query Editor */}
              <Panel defaultSize={50} minSize={1}>
                <QueryEditor
                  queryContent={queryContent}
                  selectedQuery={selectedQuery}
                  onExecute={handleQueryExecute}
                  isExecuting={isExecuting}
                />
              </Panel>

              <StyledVerticalResizeHandle />

              {/* Results */}
              <Panel defaultSize={50} minSize={1}>
                <ResultsTable results={queryResults} />
              </Panel>
            </PanelGroup>
          </Panel>

          <StyledHorizontalResizeHandle />

          {/* Right Panel - ChatBot */}
          <Panel defaultSize={25} minSize={1}>
            <Typography variant="h6" gutterBottom>
              AI Assistant
            </Typography>
            <ChatBot />
          </Panel>
        </PanelGroup>
      </Box>
    </Box>
  );
}

export default App;
