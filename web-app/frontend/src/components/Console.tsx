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

interface ConsoleProps {
  initialContent: string;
  title?: string;
  onExecute: (content: string) => void;
  isExecuting: boolean;
}

export interface ConsoleRef {
  getCurrentContent: () => {
    content: string;
    fileName?: string;
    language?: string;
  };
}

const Console = forwardRef<ConsoleRef, ConsoleProps>(
  ({ initialContent, title, onExecute, isExecuting }, ref) => {
    const editorRef = useRef<any>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const { effectiveMode } = useTheme();
    const [currentContent, setCurrentContent] = useState(initialContent);

    // Update current content when initialContent changes (e.g., new console opened)
    useEffect(() => {
      setCurrentContent(initialContent);
    }, [initialContent]);

    // Resize handling for monaco layout
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

    // Execute helper
    const executeContent = (content: string) => {
      if (content.trim()) {
        onExecute(content);
      }
    };

    const handleEditorDidMount = (editor: any, monaco: any) => {
      editorRef.current = editor;

      // CMD/CTRL + Enter execution support
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
        const model = editor.getModel();
        if (!model) return;

        const selection = editor.getSelection();
        let textToExecute = "";

        if (selection && !selection.isEmpty()) {
          textToExecute = model.getValueInRange(selection);
        } else {
          textToExecute = model.getValue();
        }

        executeContent(textToExecute);
      });
    };

    const handleEditorChange = (value: string | undefined) => {
      setCurrentContent(value || "");
    };

    const handleExecute = () => {
      executeContent(currentContent);
    };

    useImperativeHandle(ref, () => ({
      getCurrentContent: () => ({
        content: currentContent,
        fileName: title ? `${title}.js` : "console.js",
        language: "javascript",
      }),
    }));

    return (
      <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
        <Box
          sx={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            p: 1,
            backgroundColor: "background.paper",
          }}
        >
          <Button
            variant="contained"
            size="small"
            startIcon={<PlayArrow />}
            onClick={handleExecute}
            disabled={!currentContent.trim() || isExecuting}
            disableElevation
          >
            {isExecuting ? "Executing..." : "Run (⌘/Ctrl+Enter)"}
          </Button>
        </Box>

        <Box ref={containerRef} sx={{ flexGrow: 1, height: 0 }}>
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
        </Box>
      </Box>
    );
  }
);

export default Console;
