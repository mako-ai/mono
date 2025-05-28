import React, { useMemo, useCallback } from "react";
import {
  Box,
  Typography,
  Button,
  IconButton,
  Snackbar,
  Alert,
} from "@mui/material";
import { DataGridPremium, GridColDef } from "@mui/x-data-grid-premium";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";

interface QueryResult {
  query: string;
  results: any[];
  executedAt: string;
  resultCount: number;
}

interface ResultsTableProps {
  results: QueryResult | null;
}

const ResultsTable: React.FC<ResultsTableProps> = ({ results }) => {
  const [snackbarOpen, setSnackbarOpen] = React.useState(false);

  const { columns, rows } = useMemo(() => {
    if (!results || !results.results || results.results.length === 0) {
      return { columns: [], rows: [] };
    }

    // Generate columns from the first result object
    const firstResult = results.results[0];
    const cols: GridColDef[] = Object.keys(firstResult).map((key) => ({
      field: key,
      headerName: key.charAt(0).toUpperCase() + key.slice(1),
      flex: 1,
      minWidth: 150,
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
    }));

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

  if (!results) {
    return (
      <Box
        sx={{
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "1px dashed #ccc",
          borderRadius: 1,
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
          border: "1px solid #ccc",
          borderRadius: 1,
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
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Box sx={{ flexGrow: 1, width: "100%", overflow: "hidden" }}>
        <DataGridPremium
          rows={rows}
          columns={columns}
          density="compact"
          disableRowSelectionOnClick
          style={{ height: "100%", width: "100%" }}
          sx={{
            "& .MuiDataGrid-cell": {
              fontSize: "0.875rem",
            },
            borderRadius: 0,
            border: "none",
          }}
        />
      </Box>
      <Box
        sx={{
          p: 1,
          backgroundColor: "#f5f5f5",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Typography variant="body2" color="text.secondary">
          {results.resultCount} result(s) • Executed at{" "}
          {new Date(results.executedAt).toLocaleString()}
        </Typography>
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
