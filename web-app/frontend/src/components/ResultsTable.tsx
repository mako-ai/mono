import React, { useMemo } from "react";
import { Box, Typography } from "@mui/material";
import { DataGridPremium, GridColDef } from "@mui/x-data-grid-premium";

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
    <Box sx={{ height: "100%", width: "100%" }}>
      <Box sx={{ mb: 1 }}>
        <Typography variant="body2" color="text.secondary">
          {results.resultCount} result(s) • Executed at{" "}
          {new Date(results.executedAt).toLocaleString()}
        </Typography>
      </Box>
      <Box sx={{ height: "calc(100% - 40px)", width: "100%" }}>
        <DataGridPremium
          rows={rows}
          columns={columns}
          density="compact"
          disableRowSelectionOnClick
          sx={{
            "& .MuiDataGrid-cell": {
              fontSize: "0.875rem",
            },
          }}
        />
      </Box>
    </Box>
  );
};

export default ResultsTable;
