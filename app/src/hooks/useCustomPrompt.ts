import { useState, useEffect, useCallback } from "react";
import { useWorkspace } from "../contexts/workspace-context";

// Default custom prompt content (fallback)
const defaultCustomPromptContent = `# Custom Prompt Configuration

This is your custom prompt that will be combined with the system prompt to provide additional context about your data and business relationships.

## Business Context
Add information about your business domain, terminology, and key concepts here.

## Data Relationships
Describe important relationships between your collections and how they connect.

## Common Queries
Document frequently requested queries or analysis patterns.

## Custom Instructions
Add any specific instructions for how the AI should interpret your data or respond to certain types of questions.

---

*This prompt is combined with the system prompt to provide context-aware responses. You can edit this through the Settings page.*`;

// Export default content for immediate use
export const customPromptContent = defaultCustomPromptContent;

// Hook to fetch and manage custom prompt content
export const useCustomPrompt = () => {
  const { currentWorkspace } = useWorkspace();
  const [content, setContent] = useState<string>(defaultCustomPromptContent);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCustomPrompt = useCallback(async () => {
    if (!currentWorkspace?.id) {
      setError("No workspace selected");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/workspaces/${currentWorkspace.id}/custom-prompt`,
      );
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setContent(data.content);
        } else {
          setError(data.error || "Failed to fetch custom prompt");
        }
      } else {
        setError("Failed to fetch custom prompt");
      }
    } catch (err) {
      setError("Network error while fetching custom prompt");
      console.error("Error fetching custom prompt:", err);
    } finally {
      setIsLoading(false);
    }
  }, [currentWorkspace?.id]);

  const updateCustomPrompt = async (newContent: string) => {
    if (!currentWorkspace?.id) {
      setError("No workspace selected");
      return false;
    }

    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/workspaces/${currentWorkspace.id}/custom-prompt`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ content: newContent }),
        },
      );

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setContent(newContent);
          return true;
        } else {
          setError(data.error || "Failed to update custom prompt");
          return false;
        }
      } else {
        setError("Failed to update custom prompt");
        return false;
      }
    } catch (err) {
      setError("Network error while updating custom prompt");
      console.error("Error updating custom prompt:", err);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (currentWorkspace?.id) {
      fetchCustomPrompt();
    }
  }, [currentWorkspace?.id, fetchCustomPrompt]);

  return {
    content,
    isLoading,
    error,
    fetchCustomPrompt,
    updateCustomPrompt,
  };
};
