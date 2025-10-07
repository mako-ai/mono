import { useRef, useCallback, useState, useEffect } from "react";
import { ConsoleVersionManager } from "../utils/ConsoleVersionManager";
import { useConsoleStore } from "../store/consoleStore";

export interface ConsoleModification {
  action: "replace" | "insert" | "append" | "create";
  content: string;
  position?: {
    line: number;
    column: number;
  };
}

interface UseMonacoConsoleOptions {
  consoleId: string;
  onContentChange?: (content: string) => void;
  onVersionChange?: (canUndo: boolean, canRedo: boolean) => void;
}

export const useMonacoConsole = (options: UseMonacoConsoleOptions) => {
  const { consoleId, onContentChange, onVersionChange } = options;
  const editorRef = useRef<any>(null);
  const isApplyingModificationRef = useRef(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Get version manager from store
  const { getVersionManager } = useConsoleStore();

  // Get the version manager for this console
  const getVersionManagerForConsole = useCallback(() => {}, [
    consoleId,
    getVersionManager,
  ]);

  // Queue modifications that arrive before editor is ready
  const pendingModificationsRef = useRef<ConsoleModification[]>([]);

  // Update version control state
  const updateVersionState = useCallback(() => {
    const manager = getVersionManagerForConsole();
    if (!manager) return;

    const newCanUndo = manager.canUndo();
    const newCanRedo = manager.canRedo();

    setCanUndo(newCanUndo);
    setCanRedo(newCanRedo);

    if (onVersionChange) {
      onVersionChange(newCanUndo, newCanRedo);
    }
  }, [getVersionManagerForConsole, onVersionChange]);

  // Set the editor reference
  const setEditor = useCallback((editor: any) => {
    editorRef.current = editor;
  }, []);

  // Apply a console modification
  const applyModification = useCallback(
    (modification: ConsoleModification) => {
      console.log(
        "useMonacoConsole applyModification called with:",
        modification,
      );

      const editor = editorRef.current;
      console.log("Editor ref exists:", !!editor);
      if (!editor) {
        console.error("No editor ref - editor not mounted yet?");
        return;
      }

      const model = editor.getModel();
      console.log("Model exists:", !!model);
      if (!model) {
        console.error("No model on editor");
        return;
      }

      const versionManager = getVersionManagerForConsole();
      if (!versionManager) {
        console.error("No version manager for console:", consoleId);
        return;
      }

      // Save current state before modification
      const currentContent = model.getValue();
      console.log("Current content length:", currentContent.length);
      versionManager.saveVersion(
        currentContent,
        "user",
        "Before AI modification",
      );

      isApplyingModificationRef.current = true;

      try {
        console.log("Applying modification action:", modification.action);
        switch (modification.action) {
          case "replace":
            console.log(
              "Setting model value to:",
              modification.content.substring(0, 100) + "...",
            );
            model.setValue(modification.content);
            console.log("Model value set successfully");
            break;

          case "append": {
            const lineCount = model.getLineCount();
            const lastLineLength = model.getLineLength(lineCount);
            const position = new (editor as any).monaco.Position(
              lineCount,
              lastLineLength + 1,
            );
            const range = new (editor as any).monaco.Range(
              position.lineNumber,
              position.column,
              position.lineNumber,
              position.column,
            );

            editor.executeEdits("ai-modification", [
              {
                range: range,
                text:
                  (currentContent.endsWith("\n") ? "" : "\n") +
                  modification.content,
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
              : editor.getPosition() ||
                new (editor as any).monaco.Position(1, 1);

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
        console.log(
          "New content length after modification:",
          newContent.length,
        );
        versionManager.saveVersion(
          newContent,
          "ai",
          `AI ${modification.action}`,
        );

        // Flash the editor to indicate change
        console.log("Flashing editor for visual feedback");
        flashEditor(editor);

        // Update version state
        updateVersionState();

        // Notify content change
        if (onContentChange) {
          console.log("Notifying content change");
          onContentChange(newContent);
        }

        console.log("Modification applied successfully!");
      } finally {
        isApplyingModificationRef.current = false;
      }

      // Focus the editor
      editor.focus();
    },
    [
      consoleId,
      getVersionManagerForConsole,
      onContentChange,
      updateVersionState,
    ],
  );

  // Undo functionality
  const undo = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const versionManager = getVersionManagerForConsole();
    if (!versionManager) return;

    const content = versionManager.undo();
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
  }, [getVersionManagerForConsole, onContentChange, updateVersionState]);

  // Redo functionality
  const redo = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const versionManager = getVersionManagerForConsole();
    if (!versionManager) return;

    const content = versionManager.redo();
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
  }, [getVersionManagerForConsole, onContentChange, updateVersionState]);

  // Get version history
  const getHistory = useCallback(() => {
    const versionManager = getVersionManagerForConsole();
    if (!versionManager) return [];
    return versionManager.getHistory();
  }, [getVersionManagerForConsole]);

  // Restore a specific version
  const restoreVersion = useCallback(
    (versionId: string) => {
      const editor = editorRef.current;
      if (!editor) return;

      const versionManager = getVersionManagerForConsole();
      if (!versionManager) return;

      const content = versionManager.restoreVersion(versionId);
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
    },
    [getVersionManagerForConsole, onContentChange, updateVersionState],
  );

  // Save user edit as a version
  const saveUserEdit = useCallback(
    (content: string, description?: string) => {
      if (!isApplyingModificationRef.current) {
        const versionManager = getVersionManagerForConsole();
        if (!versionManager) return;

        versionManager.saveVersion(content, "user", description);
        updateVersionState();
      }
    },
    [getVersionManagerForConsole, updateVersionState],
  );

  // Clear version history
  const clearHistory = useCallback(() => {
    const versionManager = getVersionManagerForConsole();
    if (!versionManager) return;

    versionManager.clear();
    updateVersionState();
  }, [getVersionManagerForConsole, updateVersionState]);

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
    editor.getDomNode()!.style.transition =
      "background-color 200ms ease-in-out";
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
