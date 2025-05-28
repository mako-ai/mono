import {
  useRef,
  useEffect,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
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
  onCreateNew?: () => void;
  isExecuting: boolean;
  isSaving: boolean;
}

export interface ViewEditorRef {
  createNew: () => void;
  cancelCreation: () => void;
}

const ViewEditor = forwardRef<ViewEditorRef, ViewEditorProps>(
  (
    {
      viewDefinition,
      selectedView,
      onExecute,
      onSave,
      onCreateNew,
      isExecuting,
      isSaving,
    },
    ref
  ) => {
    const editorRef = useRef<any>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const { effectiveMode } = useTheme();
    const [currentContent, setCurrentContent] = useState("");
    const [isCreatingNew, setIsCreatingNew] = useState(false);
    const [collections, setCollections] = useState<string[]>([]);

    // Fetch collections for placeholder
    useEffect(() => {
      const fetchCollections = async () => {
        try {
          const response = await fetch("/api/database/collections");
          const data = await response.json();
          if (data.success) {
            setCollections(data.data.map((col: any) => col.name));
          }
        } catch (err) {
          console.error("Failed to fetch collections:", err);
        }
      };
      fetchCollections();
    }, []);

    // Update current content when viewDefinition changes or when creating new
    useEffect(() => {
      if (isCreatingNew) {
        // Create placeholder content for new view
        const placeholderCollection =
          collections.length > 0 ? collections[0] : "your_collection";
        const placeholderContent = {
          name: "new_view_name",
          viewOn: placeholderCollection,
          pipeline: [
            {
              $match: {
                // Add your match criteria here
              },
            },
            {
              $group: {
                _id: "$field_name",
                count: { $sum: 1 },
              },
            },
          ],
          options: {},
        };
        const formattedContent = JSON.stringify(placeholderContent, null, 2);
        setCurrentContent(formattedContent);
      } else if (viewDefinition) {
        const formattedContent = JSON.stringify(viewDefinition, null, 2);
        setCurrentContent(formattedContent);
      } else {
        setCurrentContent("");
      }
    }, [viewDefinition, isCreatingNew, collections]);

    // Exit creation mode when a new viewDefinition is provided
    useEffect(() => {
      if (viewDefinition && isCreatingNew) {
        setIsCreatingNew(false);
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
        // Exit new view mode after saving
        setIsCreatingNew(false);
      }
    };

    const handleCreateNew = () => {
      if (onCreateNew) {
        onCreateNew();
      } else {
        setIsCreatingNew(true);
      }
    };

    const handleCancelNew = () => {
      setIsCreatingNew(false);
      setCurrentContent("");
    };

    const isValidDefinition = () => {
      return parseViewDefinition() !== null;
    };

    const isShowingContent = selectedView || viewDefinition || isCreatingNew;
    const displayTitle = isCreatingNew
      ? "New View"
      : selectedView
      ? `View: ${selectedView}`
      : "No view selected";

    useImperativeHandle(ref, () => ({
      createNew: () => setIsCreatingNew(true),
      cancelCreation: () => setIsCreatingNew(false),
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
          <Typography variant="h6">{displayTitle}</Typography>
          <Box sx={{ display: "flex", gap: 0.5 }}>
            {isCreatingNew && (
              <Button onClick={handleCancelNew} color="secondary">
                Cancel
              </Button>
            )}
            {(selectedView || isCreatingNew) && (
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
                    !currentContent.trim() ||
                    !isValidDefinition() ||
                    isExecuting
                  }
                >
                  {isExecuting ? "Executing..." : "Run View"}
                </Button>
              </>
            )}
          </Box>
        </Box>

        <Box ref={containerRef} sx={{ flexGrow: 1, height: 0 }}>
          {isShowingContent ? (
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
                onClick={handleCreateNew}
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
  }
);

export default ViewEditor;
