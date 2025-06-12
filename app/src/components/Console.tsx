import {
  useRef,
  useEffect,
  useState,
  forwardRef,
  useImperativeHandle,
  useCallback,
  useMemo,
} from "react";
import {
  Box,
  Button,
  Select,
  MenuItem,
  FormControl,
  Tooltip,
} from "@mui/material";
import { PlayArrow, SaveOutlined } from "@mui/icons-material";
import Editor from "@monaco-editor/react";
import { useTheme } from "../contexts/ThemeContext";

interface Database {
  id: string;
  name: string;
  description: string;
  database: string;
  type: string;
  active: boolean;
  lastConnectedAt?: string;
  displayName: string;
  hostKey: string;
  hostName: string;
}

interface ConsoleProps {
  initialContent: string;
  title?: string;
  onExecute: (content: string, databaseId?: string) => void;
  onSave?: (content: string, currentPath?: string) => Promise<boolean>;
  isExecuting: boolean;
  isSaving?: boolean;
  onContentChange?: (content: string) => void;
  databases?: Database[];
  initialDatabaseId?: string;
  onDatabaseChange?: (databaseId: string) => void;
  filePath?: string;
}

export interface ConsoleRef {
  getCurrentContent: () => {
    content: string;
    fileName?: string;
    language?: string;
  };
}

const Console = forwardRef<ConsoleRef, ConsoleProps>((props, ref) => {
  const {
    initialContent,
    title,
    onExecute,
    onSave,
    isExecuting,
    isSaving,
    onContentChange,
    databases = [],
    initialDatabaseId,
    onDatabaseChange,
    filePath,
  } = props;

  const editorRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { effectiveMode } = useTheme();

  // Only track the initial content for resetting the editor when needed
  const [editorKey, setEditorKey] = useState(0);

  // Track if we're programmatically updating content to avoid feedback loops
  const isProgrammaticUpdateRef = useRef(false);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Track if user has manually selected a database
  const hasUserSelectedDatabaseRef = useRef(false);

  const [selectedDatabaseId, setSelectedDatabaseId] = useState<string>(() => {
    // Initialize with initialDatabaseId or first database or empty string
    if (initialDatabaseId) return initialDatabaseId;
    if (databases.length > 0) return databases[0].id;
    return "";
  });

  // Keep a ref of the latest selected database so closures (e.g. Monaco keybindings) always see the up-to-date value
  const selectedDatabaseIdRef = useRef<string>(selectedDatabaseId);

  // Whenever selectedDatabaseId changes, update the ref
  useEffect(() => {
    selectedDatabaseIdRef.current = selectedDatabaseId;
  }, [selectedDatabaseId]);

  // Memoize the default database ID to prevent unnecessary re-calculations
  const defaultDatabaseId = useMemo(() => {
    if (initialDatabaseId) return initialDatabaseId;
    if (databases.length > 0) return databases[0].id;
    return "";
  }, [initialDatabaseId, databases]);

  // On first load (or when the list of databases changes) pick a sensible
  // default connection **only** if the user hasn't interacted with the
  // dropdown yet.
  useEffect(() => {
    if (
      !hasUserSelectedDatabaseRef.current &&
      !selectedDatabaseId &&
      defaultDatabaseId
    ) {
      setSelectedDatabaseId(defaultDatabaseId);
    }
  }, [defaultDatabaseId, selectedDatabaseId]);

  // Sync the selected database with the incoming prop **only** when the user
  // has **not** explicitly chosen a connection. This prevents the dropdown
  // from constantly "blinking" back to the prop-driven value after every
  // keystroke or parent re-render.
  useEffect(() => {
    if (!initialDatabaseId) return; // ignore empty values

    // If the parent changed the default database (e.g., because we switched
    // files/tabs) and the user hasn't made a manual choice yet, adopt it.
    if (!hasUserSelectedDatabaseRef.current) {
      setSelectedDatabaseId(initialDatabaseId);
    }
  }, [initialDatabaseId]);

  // Notify parent whenever selectedDatabaseId changes (with debouncing to prevent loops)
  const handleDatabaseChange = useCallback(
    (databaseId: string) => {
      if (onDatabaseChange && databaseId) {
        onDatabaseChange(databaseId);
      }
    },
    [onDatabaseChange],
  );

  useEffect(() => {
    if (selectedDatabaseId) {
      handleDatabaseChange(selectedDatabaseId);
    }
  }, [selectedDatabaseId, handleDatabaseChange]);

  // Only reset editor when we're actually switching to a different console/file
  // Track the last initialContent to detect real changes vs feedback loops
  const lastInitialContentRef = useRef(initialContent);

  useEffect(() => {
    if (!editorRef.current) {
      // Editor not mounted yet, force remount with new content when it does appear
      if (initialContent !== lastInitialContentRef.current) {
        lastInitialContentRef.current = initialContent;
        setEditorKey(prev => prev + 1);
      }
      return;
    }

    const model = editorRef.current.getModel();
    const currentContent = model?.getValue() ?? "";

    // Update the editor only when the incoming content is **actually** different
    // from what the user currently sees. This prevents unnecessary model.setValue
    // calls that would otherwise clear the undo stack.
    if (initialContent !== currentContent) {
      lastInitialContentRef.current = initialContent;
      if (model) {
        isProgrammaticUpdateRef.current = true;
        model.setValue(initialContent);
        isProgrammaticUpdateRef.current = false;

        // Move the cursor to the end of the newly inserted content
        const lineCount = model.getLineCount();
        const lastLineLength = model.getLineLength(lineCount);
        editorRef.current.setPosition({
          lineNumber: lineCount,
          column: lastLineLength + 1,
        });
      }
    }
  }, [initialContent]);

  // Cleanup debounce timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

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

  // Get current content from editor
  const getCurrentEditorContent = useCallback(() => {
    if (editorRef.current) {
      const model = editorRef.current.getModel();
      if (model) {
        return model.getValue();
      }
    }
    return initialContent;
  }, [initialContent]);

  // Execute helper
  const executeContent = useCallback(
    (content: string) => {
      if (content.trim()) {
        onExecute(content, selectedDatabaseIdRef.current || undefined);
      }
    },
    [onExecute],
  );

  const handleSave = useCallback(async () => {
    if (onSave) {
      const content = getCurrentEditorContent();
      await onSave(content, filePath);
      // Parent component is responsible for feedback (e.g., snackbar, error modal)
    }
  }, [onSave, getCurrentEditorContent, filePath]);

  const handleEditorDidMount = useCallback(
    (editor: any, monaco: any) => {
      editorRef.current = editor;

      // CMD/CTRL + Enter execution support
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
        // Always use the current editor from ref to avoid stale closures
        const currentEditor = editorRef.current;
        if (!currentEditor) return;

        const model = currentEditor.getModel();
        if (!model) return;

        const selection = currentEditor.getSelection();
        let textToExecute = "";

        if (selection && !selection.isEmpty()) {
          textToExecute = model.getValueInRange(selection);
        } else {
          textToExecute = model.getValue();
        }

        // Execute directly with current database, avoiding stale closures
        if (textToExecute.trim()) {
          onExecute(textToExecute, selectedDatabaseIdRef.current || undefined);
        }
      });

      // CMD/CTRL + S save support (if onSave is provided)
      if (onSave) {
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
          if (onSave) {
            const currentEditor = editorRef.current;
            const content = currentEditor?.getModel()?.getValue() || "";
            onSave(content, filePath);
          }
        });
      }

      // Auto-focus the editor when it mounts
      editor.focus();

      // Position cursor at the end of the content
      const model = editor.getModel();
      if (model) {
        const lineCount = model.getLineCount();
        const lastLineLength = model.getLineLength(lineCount);
        editor.setPosition({
          lineNumber: lineCount,
          column: lastLineLength + 1,
        });
      }
    },
    [onExecute, onSave, filePath],
  );

  // Debounced content change notification for persistence (zustand + localStorage)
  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      // Skip if this is a programmatic update (to prevent feedback loops)
      if (isProgrammaticUpdateRef.current) {
        return;
      }

      if (onContentChange) {
        const content = value || "";

        // Clear existing timeout
        if (debounceTimeoutRef.current) {
          clearTimeout(debounceTimeoutRef.current);
        }

        // Set new debounced timeout for persistence
        debounceTimeoutRef.current = setTimeout(() => {
          onContentChange(content);
        }, 500); // 500ms debounce for persistence
      }
    },
    [onContentChange],
  );

  const handleExecute = useCallback(() => {
    // Prefer executing the currently selected text, if any, otherwise run the entire editor content
    if (editorRef.current) {
      const model = editorRef.current.getModel();
      if (model) {
        const selection = editorRef.current.getSelection();
        let textToExecute = "";

        if (selection && !selection.isEmpty()) {
          textToExecute = model.getValueInRange(selection);
        } else {
          textToExecute = model.getValue();
        }

        executeContent(textToExecute);
        return;
      }
    }

    // Fallback: execute the initial content
    executeContent(initialContent);
  }, [executeContent, initialContent]);

  const handleDatabaseSelection = useCallback((event: any) => {
    const newDatabaseId = event.target.value;
    hasUserSelectedDatabaseRef.current = true; // Mark that user has manually selected
    setSelectedDatabaseId(newDatabaseId);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      getCurrentContent: () => {
        const content = getCurrentEditorContent();
        return {
          content,
          fileName: title ? `${title}.js` : "console.js",
          language: "javascript",
        };
      },
    }),
    [getCurrentEditorContent, title],
  );

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
        <Box>
          <Button
            variant="contained"
            size="small"
            startIcon={<PlayArrow />}
            onClick={handleExecute}
            disabled={isExecuting || !selectedDatabaseId}
            disableElevation
          >
            {isExecuting ? "Executing..." : "Run (⌘/Ctrl+Enter)"}
          </Button>

          {onSave && (
            <Tooltip
              title={filePath ? "Save (⌘/Ctrl+S)" : "Save As... (⌘/Ctrl+S)"}
            >
              <Button
                variant="text"
                size="small"
                onClick={handleSave}
                disabled={isSaving || isExecuting}
                disableElevation
                sx={{
                  ml: 1,
                  minWidth: "32px",
                  width: "32px",
                  height: "32px",
                  p: 0,
                }}
              >
                <SaveOutlined />
              </Button>
            </Tooltip>
          )}
        </Box>

        <FormControl size="small" variant="standard" sx={{ minWidth: 80 }}>
          <Select
            variant="standard"
            disableUnderline
            labelId="database-select-label"
            value={selectedDatabaseId}
            onChange={handleDatabaseSelection}
            disabled={databases.length === 0}
          >
            {databases.length === 0 ? (
              <MenuItem value="" disabled>
                No databases available
              </MenuItem>
            ) : (
              databases.map(db => (
                <MenuItem key={db.id} value={db.id}>
                  {db.displayName || db.name || "Unknown Database"}
                </MenuItem>
              ))
            )}
          </Select>
        </FormControl>
      </Box>

      <Box ref={containerRef} sx={{ flexGrow: 1, height: 0 }}>
        <Editor
          key={editorKey}
          defaultLanguage="javascript"
          defaultValue={initialContent}
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
});

Console.displayName = "Console";

export default Console;
