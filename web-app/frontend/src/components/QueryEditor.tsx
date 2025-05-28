import React from "react";
import { Box, Button, Typography } from "@mui/material";
import { PlayArrow } from "@mui/icons-material";
import Editor from "@monaco-editor/react";

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
          p: 1,
        }}
      >
        <Typography variant="h6">
          {selectedQuery ? `Query: ${selectedQuery}` : "No query selected"}
        </Typography>
        <Button
          variant="contained"
          size="small"
          startIcon={<PlayArrow />}
          onClick={onExecute}
          disabled={!selectedQuery || isExecuting}
        >
          {isExecuting ? "Executing..." : "Run Query"}
        </Button>
      </Box>

      <Box sx={{ flexGrow: 1 }}>
        {selectedQuery ? (
          <Editor
            height="100%"
            defaultLanguage="javascript"
            value={queryContent}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              fontSize: 14,
              wordWrap: "on",
              scrollBeyondLastLine: false,
            }}
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
