import { useRef, useCallback, useState, useEffect } from "react";
import { ConsoleVersionManager } from "../utils/ConsoleVersionManager";

export interface ConsoleModification {
  action: "replace" | "insert" | "append";
  content: string;
  position?: {
    line: number;
    column: number;
  };
}

interface UseMonacoConsoleOptions {
  onContentChange?: (content: string) => void;
  onVersionChange?: (canUndo: boolean, canRedo: boolean) => void;
}

export const useMonacoConsole = (options: UseMonacoConsoleOptions = {}) => {
  const { onContentChange, onVersionChange } = options;
  const editorRef = useRef<any>(null);
  const versionManagerRef = useRef(new ConsoleVersionManager());
  const isApplyingModificationRef = useRef(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Update version control state
  const updateVersionState = useCallback(() => {
    const manager = versionManagerRef.current;
    const newCanUndo = manager.canUndo();
    const newCanRedo = manager.canRedo();
    
    setCanUndo(newCanUndo);
    setCanRedo(newCanRedo);
    
    if (onVersionChange) {
      onVersionChange(newCanUndo, newCanRedo);
    }
  }, [onVersionChange]);

  // Set the editor reference
  const setEditor = useCallback((editor: any) => {
    editorRef.current = editor;
  }, []);

  // Apply a console modification
  const applyModification = useCallback((modification: ConsoleModification) => {
    const editor = editorRef.current;
    if (!editor) return;

    const model = editor.getModel();
    if (!model) return;

    // Save current state before modification
    const currentContent = model.getValue();
    versionManagerRef.current.saveVersion(
      currentContent,
      "user",
      "Before AI modification",
    );

    isApplyingModificationRef.current = true;

    try {
      switch (modification.action) {
        case "replace":
          model.setValue(modification.content);
          break;

        case "append": {
          const lineCount = model.getLineCount();
          const lastLineLength = model.getLineLength(lineCount);
          const position = new (editor as any).monaco.Position(lineCount, lastLineLength + 1);
          const range = new (editor as any).monaco.Range(
            position.lineNumber,
            position.column,
            position.lineNumber,
            position.column,
          );

          editor.executeEdits("ai-modification", [
            {
              range: range,
              text: (currentContent.endsWith("\n") ? "" : "\n") + modification.content,
              forceMoveMarkers: true,
            },
          ]);
          break;
        }

        case "insert": {
          const position = modification.position
            ? new (editor as any).monaco.Position(
                modification.position.line,
                modification.position.column,
              )
            : editor.getPosition() || new (editor as any).monaco.Position(1, 1);

          const range = new (editor as any).monaco.Range(
            position.lineNumber,
            position.column,
            position.lineNumber,
            position.column,
          );

          editor.executeEdits("ai-modification", [
            {
              range: range,
              text: modification.content,
              forceMoveMarkers: true,
            },
          ]);
          break;
        }
      }

      // Save the new state after modification
      const newContent = model.getValue();
      versionManagerRef.current.saveVersion(
        newContent,
        "ai",
        `AI ${modification.action}`,
      );

      // Flash the editor to indicate change
      flashEditor(editor);

      // Update version state
      updateVersionState();

      // Notify content change
      if (onContentChange) {
        onContentChange(newContent);
      }
    } finally {
      isApplyingModificationRef.current = false;
    }

    // Focus the editor
    editor.focus();
  }, [onContentChange, updateVersionState]);

  // Undo functionality
  const undo = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const content = versionManagerRef.current.undo();
    if (content !== null) {
      const model = editor.getModel();
      if (model) {
        isApplyingModificationRef.current = true;
        model.setValue(content);
        isApplyingModificationRef.current = false;
        
        updateVersionState();
        
        if (onContentChange) {
          onContentChange(content);
        }
      }
    }
  }, [onContentChange, updateVersionState]);

  // Redo functionality
  const redo = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const content = versionManagerRef.current.redo();
    if (content !== null) {
      const model = editor.getModel();
      if (model) {
        isApplyingModificationRef.current = true;
        model.setValue(content);
        isApplyingModificationRef.current = false;
        
        updateVersionState();
        
        if (onContentChange) {
          onContentChange(content);
        }
      }
    }
  }, [onContentChange, updateVersionState]);

  // Get version history
  const getHistory = useCallback(() => {
    return versionManagerRef.current.getHistory();
  }, []);

  // Restore a specific version
  const restoreVersion = useCallback((versionId: string) => {
    const editor = editorRef.current;
    if (!editor) return;

    const content = versionManagerRef.current.restoreVersion(versionId);
    if (content !== null) {
      const model = editor.getModel();
      if (model) {
        isApplyingModificationRef.current = true;
        model.setValue(content);
        isApplyingModificationRef.current = false;
        
        updateVersionState();
        
        if (onContentChange) {
          onContentChange(content);
        }
      }
    }
  }, [onContentChange, updateVersionState]);

  // Save user edit as a version
  const saveUserEdit = useCallback((content: string, description?: string) => {
    if (!isApplyingModificationRef.current) {
      versionManagerRef.current.saveVersion(content, "user", description);
      updateVersionState();
    }
  }, [updateVersionState]);

  // Clear version history
  const clearHistory = useCallback(() => {
    versionManagerRef.current.clear();
    updateVersionState();
  }, [updateVersionState]);

  // Initialize version state on mount
  useEffect(() => {
    updateVersionState();
  }, [updateVersionState]);

  return {
    setEditor,
    applyModification,
    undo,
    redo,
    canUndo,
    canRedo,
    getHistory,
    restoreVersion,
    saveUserEdit,
    clearHistory,
    isApplyingModification: isApplyingModificationRef,
  };
};

// Helper function to flash the editor for visual feedback
function flashEditor(editor: any) {
  const originalBackground = editor.getDomNode()?.style.backgroundColor || "";
  const flashColor = "rgba(59, 130, 246, 0.1)"; // Blue flash

  if (editor.getDomNode()) {
    editor.getDomNode()!.style.transition = "background-color 200ms ease-in-out";
    editor.getDomNode()!.style.backgroundColor = flashColor;
    
    setTimeout(() => {
      if (editor.getDomNode()) {
        editor.getDomNode()!.style.backgroundColor = originalBackground;
        
        setTimeout(() => {
          if (editor.getDomNode()) {
            editor.getDomNode()!.style.transition = "";
          }
        }, 200);
      }
    }, 200);
  }
}