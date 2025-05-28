import React, { useState } from "react";
import { Box, Grid, Paper, Typography, AppBar, Toolbar } from "@mui/material";
import QueryExplorer from "./components/QueryExplorer";
import QueryEditor from "./components/QueryEditor";
import ResultsTable from "./components/ResultsTable";
import ChatBot from "./components/ChatBot";

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
      <AppBar position="static" elevation={1}>
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            Query Runner
          </Typography>
        </Toolbar>
      </AppBar>

      <Box sx={{ flexGrow: 1, p: 2 }}>
        <Grid container spacing={2} sx={{ height: "100%" }}>
          {/* Left Panel - Query Explorer */}
          <Grid item xs={3}>
            <Paper sx={{ height: "100%", p: 2 }}>
              <Typography variant="h6" gutterBottom>
                Queries
              </Typography>
              <QueryExplorer onQuerySelect={handleQuerySelect} />
            </Paper>
          </Grid>

          {/* Middle Panel - Editor and Results */}
          <Grid item xs={6}>
            <Grid
              container
              direction="column"
              spacing={2}
              sx={{ height: "100%" }}
            >
              {/* Query Editor */}
              <Grid item xs={6}>
                <Paper sx={{ height: "100%", p: 2 }}>
                  <QueryEditor
                    queryContent={queryContent}
                    selectedQuery={selectedQuery}
                    onExecute={handleQueryExecute}
                    isExecuting={isExecuting}
                  />
                </Paper>
              </Grid>

              {/* Results */}
              <Grid item xs={6}>
                <Paper sx={{ height: "100%", p: 2 }}>
                  <Typography variant="h6" gutterBottom>
                    Results
                  </Typography>
                  <ResultsTable results={queryResults} />
                </Paper>
              </Grid>
            </Grid>
          </Grid>

          {/* Right Panel - ChatBot */}
          <Grid item xs={3}>
            <Paper sx={{ height: "100%", p: 2 }}>
              <Typography variant="h6" gutterBottom>
                AI Assistant
              </Typography>
              <ChatBot />
            </Paper>
          </Grid>
        </Grid>
      </Box>
    </Box>
  );
}

export default App;
