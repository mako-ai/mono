import React, { useMemo, useCallback, useEffect } from "react";
import {
  Box,
  Typography,
  Button,
  Snackbar,
  Alert,
  ToggleButtonGroup,
  ToggleButton,
} from "@mui/material";
import { DataGridPremium, GridColDef } from "@mui/x-data-grid-premium";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import TableViewIcon from "@mui/icons-material/TableView";
import CodeIcon from "@mui/icons-material/Code";
import Editor from "@monaco-editor/react";
import { useTheme } from "../contexts/ThemeContext";

interface QueryResult {
  results: any[];
  executedAt: string;
  resultCount: number;
}

interface ResultsTableProps {
  results: QueryResult | null;
}

const ResultsTable: React.FC<ResultsTableProps> = ({ results }) => {
  const [snackbarOpen, setSnackbarOpen] = React.useState(false);
  const [viewMode, setViewMode] = React.useState<"table" | "json">("table");
  const { effectiveMode } = useTheme();

  // Reset to table view whenever new results are received
  useEffect(() => {
    if (results) {
      setViewMode("table");
    }
  }, [results?.executedAt]); // Use executedAt as dependency to detect new query executions

  const { columns, rows } = useMemo(() => {
    if (!results || !results.results || results.results.length === 0) {
      return { columns: [], rows: [] };
    }

    // Generate columns from the first result object
    const firstResult = results.results[0];
    const cols: GridColDef[] = Object.keys(firstResult).map((key) => {
      // Check if this column contains numeric values by sampling the first few rows
      const sampleValues = results.results.slice(0, 10).map((row) => row[key]);
      const isNumericColumn = sampleValues.every(
        (value) =>
          value === null ||
          value === undefined ||
          (typeof value === "number" && !isNaN(value)) ||
          (typeof value === "string" &&
            !isNaN(Number(value)) &&
            value.trim() !== "")
      );

      return {
        field: key,
        headerName: key.charAt(0).toUpperCase() + key.slice(1),
        flex: 1,
        minWidth: 100,
        maxWidth: 300,
        align: isNumericColumn ? "right" : "left",
        headerAlign: isNumericColumn ? "right" : "left",
        renderCell: (params) => {
          const value = params.value;
          if (typeof value === "undefined") {
            return undefined;
          }
          if (value === null) {
            return null;
          }
          if (typeof value === "object" && value !== null) {
            return JSON.stringify(value);
          }
          return String(value);
        },
      };
    });

    // Generate rows with unique IDs
    const rowsData = results.results.map((result, index) => ({
      id: index,
      ...result,
    }));

    return { columns: cols, rows: rowsData };
  }, [results]);

  const copyToClipboard = useCallback(async () => {
    if (!results || !results.results || results.results.length === 0) {
      return;
    }

    try {
      // Get column headers
      const headers = columns.map((col) => col.field);

      // Create CSV-like format that works well with Google Sheets
      const csvContent = [
        // Header row
        headers.join("\t"),
        // Data rows
        ...results.results.map((row) =>
          headers
            .map((header) => {
              const value = row[header];
              if (value === null || value === undefined) {
                return "";
              }
              if (typeof value === "object") {
                return JSON.stringify(value);
              }
              // Escape tabs and newlines for CSV compatibility
              return String(value).replace(/\t/g, " ").replace(/\n/g, " ");
            })
            .join("\t")
        ),
      ].join("\n");

      await navigator.clipboard.writeText(csvContent);
      setSnackbarOpen(true);
    } catch (error) {
      console.error("Failed to copy to clipboard:", error);
    }
  }, [results, columns]);

  const handleViewModeChange = useCallback(
    (_event: React.MouseEvent<HTMLElement>, newViewMode: "table" | "json") => {
      if (newViewMode !== null) {
        setViewMode(newViewMode);
      }
    },
    []
  );

  const jsonContent = JSON.stringify(results, null, 2);

  if (!results) {
    return (
      <Box
        sx={{
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "text.secondary",
        }}
      >
        <Typography>Execute a query to see results here</Typography>
      </Box>
    );
  }

  if (results.results.length === 0) {
    return (
      <Box
        sx={{
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "text.secondary",
        }}
      >
        <Typography>No results found</Typography>
      </Box>
    );
  }

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
      <Box
        sx={{
          flexGrow: 1,
          overflow: "hidden",
          width: "100%",
          maxWidth: "100%",
        }}
      >
        {viewMode === "table" ? (
          <DataGridPremium
            rows={rows}
            columns={columns}
            density="compact"
            disableRowSelectionOnClick
            style={{
              height: "100%",
              width: "100%",
              maxWidth: "100%",
            }}
            sx={{
              "& .MuiDataGrid-cell": {
                fontSize: "0.875rem",
                backgroundColor: "background.paper",
                overflow: "hidden",
                textOverflow: "ellipsis",
              },
              "& .MuiDataGrid-columnHeaders": {
                backgroundColor: "background.default",
              },
              "& .MuiDataGrid-columnHeader": {
                backgroundColor: "background.default",
              },
              "& .MuiDataGrid-root": {
                overflow: "hidden",
              },
              "& .MuiDataGrid-main": {
                overflow: "hidden",
              },
              "& .MuiDataGrid-virtualScroller": {
                overflow: "auto",
              },
              borderRadius: 0,
              border: "none",
              width: "100%",
              maxWidth: "100%",
            }}
          />
        ) : (
          <Box
            sx={{
              height: "100%",
              width: "100%",
              maxWidth: "100%",
              overflow: "hidden",
            }}
          >
            <Editor
              height="100%"
              defaultLanguage="json"
              value={jsonContent}
              theme={effectiveMode === "dark" ? "vs-dark" : "vs"}
              options={{
                readOnly: true,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                fontSize: 14,
                wordWrap: "on",
                automaticLayout: true,
              }}
            />
          </Box>
        )}
      </Box>
      <Box
        sx={{
          p: 1,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Typography variant="body2" color="text.secondary">
          {results.resultCount} result(s) • Executed at{" "}
          {new Date(results.executedAt).toLocaleString()}
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <ToggleButtonGroup
            value={viewMode}
            exclusive
            onChange={handleViewModeChange}
            size="small"
            aria-label="view mode"
          >
            <ToggleButton value="table" aria-label="table view">
              <TableViewIcon fontSize="small" />
            </ToggleButton>
            <ToggleButton value="json" aria-label="json view">
              <CodeIcon fontSize="small" />
            </ToggleButton>
          </ToggleButtonGroup>
          <Button
            variant="outlined"
            size="small"
            startIcon={<ContentCopyIcon />}
            onClick={copyToClipboard}
            sx={{ minWidth: "auto" }}
          >
            Copy Table
          </Button>
        </Box>
      </Box>
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        onClose={() => setSnackbarOpen(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert
          onClose={() => setSnackbarOpen(false)}
          severity="success"
          sx={{ width: "100%" }}
        >
          Table copied to clipboard! You can now paste it in Google Sheets.
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default ResultsTable;
