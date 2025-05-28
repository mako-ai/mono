import React from "react";
import { Box, Button, Typography, TextField } from "@mui/material";
import { PlayArrow } from "@mui/icons-material";

interface QueryEditorProps {
  queryContent: string;
  selectedQuery: string;
  onExecute: () => void;
  isExecuting: boolean;
}

const QueryEditor: React.FC<QueryEditorProps> = ({
  queryContent,
  selectedQuery,
  onExecute,
  isExecuting,
}) => {
  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 2,
        }}
      >
        <Typography variant="h6">
          {selectedQuery ? `Query: ${selectedQuery}` : "No query selected"}
        </Typography>
        <Button
          variant="contained"
          startIcon={<PlayArrow />}
          onClick={onExecute}
          disabled={!selectedQuery || isExecuting}
        >
          {isExecuting ? "Executing..." : "Run Query"}
        </Button>
      </Box>

      <Box sx={{ flexGrow: 1 }}>
        {selectedQuery ? (
          <TextField
            multiline
            fullWidth
            value={queryContent}
            variant="outlined"
            placeholder="Query content will appear here..."
            InputProps={{
              readOnly: true,
              sx: {
                height: "100%",
                "& .MuiInputBase-input": {
                  height: "100% !important",
                  overflow: "auto !important",
                  fontFamily: "monospace",
                  fontSize: "14px",
                },
              },
            }}
            sx={{ height: "100%" }}
          />
        ) : (
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
            <Typography>
              Select a query from the explorer to view its content
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default QueryEditor;
