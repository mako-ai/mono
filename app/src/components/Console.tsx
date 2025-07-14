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
  IconButton,
  Divider,
  Badge,
  Alert,
  Stack,
} from "@mui/material";
import {
  PlayArrow,
  SaveOutlined,
  Undo,
  Redo,
  History,
  Check,
  Close,
} from "@mui/icons-material";
import Editor, { DiffEditor } from "@monaco-editor/react";
import { useTheme } from "../contexts/ThemeContext";
import {
  useMonacoConsole,
  ConsoleModification,
} from "../hooks/useMonacoConsole";

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
  consoleId: string;
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
  onHistoryClick?: () => void;
  enableVersionControl?: boolean;
}

export interface ConsoleRef {
  getCurrentContent: () => {
    content: string;
    fileName?: string;
    language?: string;
  };
  applyModification: (modification: ConsoleModification) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  showDiff: (modification: ConsoleModification) => void;
}

const Console = forwardRef<ConsoleRef, ConsoleProps>((props, ref) => {
  const {
    consoleId,
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
    onHistoryClick,
    enableVersionControl = false,
  } = props;

  const editorRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { effectiveMode } = useTheme();

  // Use the Monaco console hook for version management
  const {
    setEditor,
    applyModification,
    undo,
    redo,
    canUndo,
    canRedo,
    getHistory,
    saveUserEdit,
    isApplyingModification,
  } = useMonacoConsole({
    consoleId,
    onContentChange: enableVersionControl ? onContentChange : undefined,
  });

  // Keep refs of the latest callbacks to avoid stale closures in Monaco commands
  const onExecuteRef = useRef(onExecute);
  const onSaveRef = useRef(onSave);

  // Update refs whenever the callbacks change
  useEffect(() => {
    onExecuteRef.current = onExecute;
  }, [onExecute]);

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  // Diff mode state
  const [isDiffMode, setIsDiffMode] = useState(false);
  const [pendingModification, setPendingModification] =
    useState<ConsoleModification | null>(null);
  const [originalContent, setOriginalContent] = useState("");
  const [modifiedContent, setModifiedContent] = useState("");

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
        onExecuteRef.current(
          content,
          selectedDatabaseIdRef.current || undefined,
        );
      }
    },
    [], // Remove onExecute from dependencies since we're using the ref
  );

  const handleSave = useCallback(async () => {
    if (onSave) {
      // If in diff mode, save the modified content
      const content =
        isDiffMode && modifiedContent
          ? modifiedContent
          : getCurrentEditorContent();
      await onSave(content, filePath);
      // Parent component is responsible for feedback (e.g., snackbar, error modal)
    }
  }, [onSave, getCurrentEditorContent, filePath, isDiffMode, modifiedContent]);

  const handleExecute = useCallback(() => {
    // If in diff mode, execute the modified content
    if (isDiffMode && modifiedContent) {
      executeContent(modifiedContent);
      return;
    }

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
  }, [executeContent, initialContent, isDiffMode, modifiedContent]);

  const handleDatabaseSelection = useCallback((event: any) => {
    const newDatabaseId = event.target.value;
    hasUserSelectedDatabaseRef.current = true; // Mark that user has manually selected
    setSelectedDatabaseId(newDatabaseId);
  }, []);

  const handleEditorDidMount = useCallback(
    (editor: any, monaco: any) => {
      editorRef.current = editor;

      // Always connect editor to the hook (needed for AI modifications)
      setEditor(editor);

      // CMD/CTRL + Enter execution support
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
        // Use handleExecute which already has diff mode logic
        handleExecute();
      });

      // CMD/CTRL + S save support (if onSave is provided)
      if (onSave) {
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
          handleSave();
        });
      }

      // Version control keyboard shortcuts
      if (enableVersionControl) {
        // Override default undo/redo to use our version system
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyZ, () => {
          undo();
        });

        editor.addCommand(
          monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyZ,
          () => {
            redo();
          },
        );
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
    [
      filePath,
      enableVersionControl,
      setEditor,
      undo,
      redo,
      handleExecute,
      handleSave,
      onSave,
    ],
  );

  // Debounced content change notification for persistence (zustand + localStorage)
  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      // Skip if this is a programmatic update (to prevent feedback loops)
      if (isProgrammaticUpdateRef.current || isApplyingModification.current) {
        return;
      }

      const content = value || "";

      // Save user edit to version history if version control is enabled
      if (enableVersionControl && content !== lastInitialContentRef.current) {
        // Clear existing timeout
        if (debounceTimeoutRef.current) {
          clearTimeout(debounceTimeoutRef.current);
        }

        // Debounce saving user edits to avoid too many versions
        debounceTimeoutRef.current = setTimeout(() => {
          saveUserEdit(content, "User edit");
        }, 1000); // 1 second debounce for version saves
      }

      // Normal content change callback
      if (onContentChange) {
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
    [
      onContentChange,
      enableVersionControl,
      saveUserEdit,
      isApplyingModification,
    ],
  );

  // Calculate modified content based on the modification
  const calculateModifiedContent = useCallback(
    (current: string, modification: ConsoleModification): string => {
      switch (modification.action) {
        case "replace":
          return modification.content;

        case "append":
          return (
            current +
            (current.endsWith("\n") ? "" : "\n") +
            modification.content
          );

        case "insert": {
          if (!modification.position) {
            return modification.content + current;
          }

          const lines = current.split("\n");
          const { line, column } = modification.position;
          const lineIndex = line - 1;

          if (lineIndex >= 0 && lineIndex < lines.length) {
            const targetLine = lines[lineIndex];
            const before = targetLine.slice(0, column - 1);
            const after = targetLine.slice(column - 1);
            lines[lineIndex] = before + modification.content + after;
          }

          return lines.join("\n");
        }

        default:
          return current;
      }
    },
    [],
  );

  // Show diff instead of applying modification immediately
  const showDiff = useCallback(
    (modification: ConsoleModification) => {
      const currentContent = getCurrentEditorContent();
      const newContent = calculateModifiedContent(currentContent, modification);

      setOriginalContent(currentContent);
      setModifiedContent(newContent);
      setPendingModification(modification);
      setIsDiffMode(true);
    },
    [getCurrentEditorContent, calculateModifiedContent],
  );

  // Accept the changes
  const acceptChanges = useCallback(() => {
    if (pendingModification && modifiedContent) {
      // Exit diff mode first to restore the normal editor
      setIsDiffMode(false);

      // Force editor remount with new content by incrementing key
      setEditorKey(prev => prev + 1);

      // Store the modified content that will be used when editor mounts
      isProgrammaticUpdateRef.current = true;
      lastInitialContentRef.current = modifiedContent;

      // Clear the diff state
      const savedModifiedContent = modifiedContent;
      const savedOriginalContent = originalContent;
      const savedModification = pendingModification;

      setPendingModification(null);
      setOriginalContent("");
      setModifiedContent("");

      // Wait for editor to mount, then apply the content and save to history
      setTimeout(() => {
        if (editorRef.current) {
          const model = editorRef.current.getModel();
          if (model) {
            model.setValue(savedModifiedContent);

            // Save to version history using the hook functions
            if (enableVersionControl) {
              // The saveUserEdit function will handle version tracking
              saveUserEdit(savedOriginalContent, "Before AI modification");
              saveUserEdit(
                savedModifiedContent,
                `AI ${savedModification.action}`,
              );
            }

            // Notify content change
            if (onContentChange) {
              onContentChange(savedModifiedContent);
            }
          }
        }
        isProgrammaticUpdateRef.current = false;
      }, 100);
    }
  }, [
    pendingModification,
    modifiedContent,
    originalContent,
    onContentChange,
    enableVersionControl,
    saveUserEdit,
  ]);

  // Reject the changes
  const rejectChanges = useCallback(() => {
    // Simply exit diff mode without applying changes
    setIsDiffMode(false);
    setPendingModification(null);
    setOriginalContent("");
    setModifiedContent("");
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
      applyModification,
      undo,
      redo,
      canUndo,
      canRedo,
      showDiff,
    }),
    [
      getCurrentEditorContent,
      title,
      applyModification,
      undo,
      redo,
      canUndo,
      canRedo,
      showDiff,
    ],
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
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
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

          {enableVersionControl && (
            <>
              <Divider orientation="vertical" flexItem />

              <Tooltip title="Undo (⌘/Ctrl+Z)">
                <span>
                  <IconButton
                    size="small"
                    onClick={undo}
                    disabled={!canUndo || isDiffMode}
                    sx={{ p: 0.5 }}
                  >
                    <Undo fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>

              <Tooltip title="Redo (⌘/Ctrl+Shift+Z)">
                <span>
                  <IconButton
                    size="small"
                    onClick={redo}
                    disabled={!canRedo || isDiffMode}
                    sx={{ p: 0.5 }}
                  >
                    <Redo fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>

              {onHistoryClick && (
                <Tooltip title="Version History">
                  <IconButton
                    size="small"
                    onClick={onHistoryClick}
                    disabled={isDiffMode}
                    sx={{ p: 0.5 }}
                  >
                    <Badge
                      badgeContent={getHistory().length}
                      color="primary"
                      max={99}
                    >
                      <History fontSize="small" />
                    </Badge>
                  </IconButton>
                </Tooltip>
              )}
            </>
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

      {/* Diff mode action bar - shown below the main toolbar */}
      {isDiffMode && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            px: 1,
            pb: 1,
            backgroundColor: "background.paper",
            gap: 0.5,
            justifyContent: "space-between",
          }}
        >
          <Alert
            severity="info"
            sx={{
              p: 0,
              pl: 1,
              pr: 2,
              "& .MuiAlert-icon": {
                fontSize: "1.25rem",
              },
            }}
          >
            AI suggested changes - Review the diff below
          </Alert>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
            }}
          >
            <Button
              variant="contained"
              color="success"
              size="small"
              startIcon={<Check />}
              onClick={acceptChanges}
              disableElevation
            >
              Accept
            </Button>
            <Button
              variant="outlined"
              color="error"
              size="small"
              startIcon={<Close />}
              onClick={rejectChanges}
              disableElevation
            >
              Reject
            </Button>
          </Box>
        </Box>
      )}

      <Box ref={containerRef} sx={{ flexGrow: 1, height: 0 }}>
        {!isDiffMode ? (
          <Editor
            key={editorKey}
            defaultLanguage="javascript"
            defaultValue={lastInitialContentRef.current || initialContent}
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
          <DiffEditor
            height="100%"
            theme={effectiveMode === "dark" ? "vs-dark" : "vs"}
            original={originalContent}
            modified={modifiedContent}
            options={{
              automaticLayout: true,
              readOnly: true,
              minimap: { enabled: false },
              fontSize: 12,
              wordWrap: "on",
              scrollBeyondLastLine: false,
              renderSideBySide: false,
              enableSplitViewResizing: false,
              diffWordWrap: "on",
            }}
          />
        )}
      </Box>
    </Box>
  );
});

Console.displayName = "Console";

export default Console;
