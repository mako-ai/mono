import React, { useRef, useEffect, useState } from "react";
import { Box, Button, Typography } from "@mui/material";
import {
  PlayArrow,
  Save as SaveIcon,
  Add as AddIcon,
} from "@mui/icons-material";
import Editor from "@monaco-editor/react";
import { useTheme } from "../contexts/ThemeContext";

interface ViewDefinition {
  name: string;
  viewOn: string;
  pipeline: any[];
  options?: any;
}

interface ViewEditorProps {
  viewDefinition: ViewDefinition | null;
  selectedView: string;
  onExecute: (viewDefinition: ViewDefinition) => void;
  onSave: (viewDefinition: ViewDefinition) => void;
  onCreate: () => void;
  isExecuting: boolean;
  isSaving: boolean;
}

const ViewEditor: React.FC<ViewEditorProps> = ({
  viewDefinition,
  selectedView,
  onExecute,
  onSave,
  onCreate,
  isExecuting,
  isSaving,
}) => {
  const editorRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { effectiveMode } = useTheme();
  const [currentContent, setCurrentContent] = useState("");

  // Update current content when viewDefinition changes
  useEffect(() => {
    if (viewDefinition) {
      const formattedContent = JSON.stringify(viewDefinition, null, 2);
      setCurrentContent(formattedContent);
    } else {
      setCurrentContent("");
    }
  }, [viewDefinition]);

  useEffect(() => {
    const handleResize = () => {
      if (editorRef.current) {
        editorRef.current.layout();
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  const handleEditorDidMount = (editor: any) => {
    editorRef.current = editor;
  };

  const handleEditorChange = (value: string | undefined) => {
    setCurrentContent(value || "");
  };

  const parseViewDefinition = (): ViewDefinition | null => {
    try {
      const parsed = JSON.parse(currentContent);
      if (!parsed.name || !parsed.viewOn || !Array.isArray(parsed.pipeline)) {
        throw new Error("Invalid view definition format");
      }
      return parsed;
    } catch (error) {
      console.error("Failed to parse view definition:", error);
      return null;
    }
  };

  const handleExecute = () => {
    const parsed = parseViewDefinition();
    if (parsed) {
      onExecute(parsed);
    }
  };

  const handleSave = () => {
    const parsed = parseViewDefinition();
    if (parsed) {
      onSave(parsed);
    }
  };

  const isValidDefinition = () => {
    return parseViewDefinition() !== null;
  };

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
          {selectedView ? `View: ${selectedView}` : "No view selected"}
        </Typography>
        <Box sx={{ display: "flex", gap: 0.5 }}>
          <Button startIcon={<AddIcon />} onClick={onCreate} color="secondary">
            New View
          </Button>
          {selectedView && (
            <>
              <Button
                startIcon={<SaveIcon />}
                onClick={handleSave}
                disabled={
                  !currentContent.trim() || !isValidDefinition() || isSaving
                }
              >
                {isSaving ? "Saving..." : "Save"}
              </Button>
              <Button
                startIcon={<PlayArrow />}
                onClick={handleExecute}
                disabled={
                  !currentContent.trim() || !isValidDefinition() || isExecuting
                }
              >
                {isExecuting ? "Executing..." : "Run View"}
              </Button>
            </>
          )}
        </Box>
      </Box>

      <Box ref={containerRef} sx={{ flexGrow: 1, height: 0 }}>
        {selectedView || viewDefinition ? (
          <Editor
            defaultLanguage="json"
            value={currentContent}
            height="100%"
            theme={effectiveMode === "dark" ? "vs-dark" : "vs"}
            onMount={handleEditorDidMount}
            onChange={handleEditorChange}
            options={{
              automaticLayout: true,
              readOnly: false,
              minimap: { enabled: false },
              fontSize: 12,
              wordWrap: "on",
              scrollBeyondLastLine: false,
              formatOnPaste: true,
              formatOnType: true,
            }}
          />
        ) : (
          <Box
            sx={{
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "text.secondary",
              flexDirection: "column",
              gap: 2,
            }}
          >
            <Typography>
              Select a view from the explorer to view and edit its definition,
              or create a new view
            </Typography>
            <Button
              startIcon={<AddIcon />}
              onClick={onCreate}
              color="primary"
              variant="contained"
            >
              New View
            </Button>
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default ViewEditor;
