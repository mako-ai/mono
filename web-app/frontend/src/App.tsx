import { useState } from "react";
import { Box, Paper, Typography } from "@mui/material";
import QueryExplorer from "./components/QueryExplorer";
import QueryEditor from "./components/QueryEditor";
import ResultsTable from "./components/ResultsTable";
import ChatBot from "./components/ChatBot";
// @ts-ignore – types will be available once the package is installed
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";

interface QueryResult {
  query: string;
  results: any[];
  executedAt: string;
  resultCount: number;
}

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

  const handleQueryExecute = async () => {
    if (!selectedQuery) return;

    setIsExecuting(true);
    try {
      const response = await fetch(`/api/run/${selectedQuery}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
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
      <PanelGroup direction="horizontal" style={{ height: "100%" }}>
        {/* Left Panel - Query Explorer */}
        <Panel defaultSize={20} minSize={1}>
          <QueryExplorer onQuerySelect={handleQuerySelect} />
        </Panel>

        <PanelResizeHandle
          style={{ width: "4px", background: "#ddd", cursor: "col-resize" }}
        />

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

            <PanelResizeHandle
              style={{
                height: "4px",
                background: "#ddd",
                cursor: "row-resize",
              }}
            />

            {/* Results */}
            <Panel defaultSize={50} minSize={1}>
              <ResultsTable results={queryResults} />
            </Panel>
          </PanelGroup>
        </Panel>

        <PanelResizeHandle
          style={{ width: "4px", background: "#ddd", cursor: "col-resize" }}
        />

        {/* Right Panel - ChatBot */}
        <Panel defaultSize={25} minSize={1}>
          <Paper sx={{ height: "100%", p: 2 }}>
            <Typography variant="h6" gutterBottom>
              AI Assistant
            </Typography>
            <ChatBot />
          </Paper>
        </Panel>
      </PanelGroup>
    </Box>
  );
}

export default App;
