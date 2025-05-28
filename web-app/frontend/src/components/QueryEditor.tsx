import React, {
  useRef,
  useEffect,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import { Box, Button, Typography } from "@mui/material";
import { PlayArrow } from "@mui/icons-material";
import Editor from "@monaco-editor/react";
import { useTheme } from "../contexts/ThemeContext";

interface QueryEditorProps {
  queryContent: string;
  selectedQuery: string;
  onExecute: (content: string) => void;
  isExecuting: boolean;
}

export interface QueryEditorRef {
  getCurrentContent: () => {
    content: string;
    fileName?: string;
    language?: string;
  };
}

const QueryEditor = forwardRef<QueryEditorRef, QueryEditorProps>(
  ({ queryContent, selectedQuery, onExecute, isExecuting }, ref) => {
    const editorRef = useRef<any>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const { effectiveMode } = useTheme();
    const [currentContent, setCurrentContent] = useState(queryContent);

    // Update current content when queryContent changes (new query selected)
    useEffect(() => {
      setCurrentContent(queryContent);
    }, [queryContent]);

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

    const handleExecute = () => {
      onExecute(currentContent);
    };

    useImperativeHandle(ref, () => ({
      getCurrentContent: () => ({
        content: currentContent,
        fileName: selectedQuery ? `${selectedQuery}.js` : "query.js",
        language: "javascript",
      }),
    }));

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
            onClick={handleExecute}
            disabled={!currentContent.trim() || isExecuting}
          >
            {isExecuting ? "Executing..." : "Run Query"}
          </Button>
        </Box>

        <Box ref={containerRef} sx={{ flexGrow: 1, height: 0 }}>
          {selectedQuery ? (
            <Editor
              defaultLanguage="javascript"
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
              }}
            >
              <Typography>
                Select a query from the explorer to view and edit its content
              </Typography>
            </Box>
          )}
        </Box>
      </Box>
    );
  }
);

export default QueryEditor;
