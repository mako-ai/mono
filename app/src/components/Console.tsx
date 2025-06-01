import {
  useRef,
  useEffect,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import { Box, Button, Select, MenuItem, FormControl } from "@mui/material";
import { PlayArrow } from "@mui/icons-material";
import Editor from "@monaco-editor/react";
import { useTheme } from "../contexts/ThemeContext";

interface Database {
  id: string;
  localId: string;
  name: string;
  description: string;
  database: string;
  active: boolean;
}

interface ConsoleProps {
  initialContent: string;
  title?: string;
  onExecute: (content: string, databaseId?: string) => void;
  isExecuting: boolean;
  onContentChange?: (content: string) => void;
  databases?: Database[];
  initialDatabaseId?: string;
  onDatabaseChange?: (databaseId: string) => void;
}

export interface ConsoleRef {
  getCurrentContent: () => {
    content: string;
    fileName?: string;
    language?: string;
  };
}

const Console = forwardRef<ConsoleRef, ConsoleProps>(
  (
    {
      initialContent,
      title,
      onExecute,
      isExecuting,
      onContentChange,
      databases = [],
      initialDatabaseId,
      onDatabaseChange,
    },
    ref
  ) => {
    const editorRef = useRef<any>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const { effectiveMode } = useTheme();
    const [currentContent, setCurrentContent] = useState(initialContent);
    const [selectedDatabaseId, setSelectedDatabaseId] = useState<string>(
      initialDatabaseId || ""
    );
    // Keep a ref of the latest selected database so closures (e.g. Monaco keybindings) always see the up-to-date value
    const selectedDatabaseIdRef = useRef<string>("");

    // Whenever selectedDatabaseId changes, update the ref
    useEffect(() => {
      selectedDatabaseIdRef.current = selectedDatabaseId;
    }, [selectedDatabaseId]);

    // Set default database when databases are loaded
    useEffect(() => {
      if (databases.length > 0 && !selectedDatabaseId) {
        setSelectedDatabaseId(databases[0].id);
      }
    }, [databases, selectedDatabaseId]);

    // Update internal selected DB if prop changes
    useEffect(() => {
      if (initialDatabaseId && initialDatabaseId !== selectedDatabaseId) {
        setSelectedDatabaseId(initialDatabaseId);
      }
    }, [initialDatabaseId]);

    // Notify parent whenever selectedDatabaseId changes
    useEffect(() => {
      if (selectedDatabaseId && onDatabaseChange) {
        onDatabaseChange(selectedDatabaseId);
      }
    }, [selectedDatabaseId]);

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
        onExecute(content, selectedDatabaseIdRef.current || undefined);
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
      const newContent = value || "";
      setCurrentContent(newContent);
      // Notify parent of content change
      if (onContentChange) {
        onContentChange(newContent);
      }
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
            justifyContent: "space-between",
            alignItems: "center",
            p: 1,
            backgroundColor: "background.paper",
            gap: 1,
          }}
        >
          <Button
            variant="contained"
            size="small"
            startIcon={<PlayArrow />}
            onClick={handleExecute}
            disabled={
              !currentContent.trim() || isExecuting || !selectedDatabaseId
            }
            disableElevation
          >
            {isExecuting ? "Executing..." : "Run (⌘/Ctrl+Enter)"}
          </Button>

          <FormControl size="small" sx={{ minWidth: 200 }}>
            <Select
              labelId="database-select-label"
              value={selectedDatabaseId}
              onChange={(e) => setSelectedDatabaseId(e.target.value)}
              disabled={databases.length === 0}
            >
              {databases.length === 0 ? (
                <MenuItem value="" disabled>
                  No databases available
                </MenuItem>
              ) : (
                databases.map((db) => (
                  <MenuItem key={db.id} value={db.id}>
                    {db.database}
                  </MenuItem>
                ))
              )}
            </Select>
          </FormControl>
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
