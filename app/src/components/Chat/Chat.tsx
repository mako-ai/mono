import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Box,
  Typography,
  Button,
  Alert,
  IconButton,
  Menu,
  ListItemText,
  ListItemIcon,
  MenuItem,
} from "@mui/material";
import OpenAI from "openai";
import UserInput from "./UserInput";
import MessageList from "./MessageList";
import AttachmentSelector from "./AttachmentSelector";
import { ChatProps, Message, AttachedContext, Collection, View } from "./types";
import { systemPromptContent } from "./SystemPrompt";
import { useChatStore } from "../../store/chatStore";
import { useConsoleStore } from "../../store/consoleStore";
import { useAppStore } from "../../store/appStore";
import {
  History as HistoryIcon,
  Add as AddIcon,
  Chat as ChatIcon,
  Delete as DeleteIcon,
} from "@mui/icons-material";
import { useCustomPrompt } from "./CustomPrompt";

const Chat: React.FC<ChatProps> = () => {
  // Get state and actions from Zustand store
  const {
    chatSessions,
    currentChatId,
    createNewChat,
    setCurrentChat,
    deleteChat,
    getCurrentMessages,
    addMessage,
    attachedContext,
    addContextItem,
    removeContextItem,
    selectedModel,
    setSelectedModel,
    error,
    setError,
  } = useChatStore();

  // Get console store hooks
  const { consoleTabs, addConsoleTab, updateConsoleContent, setActiveConsole } =
    useConsoleStore();

  // Get loading state and dispatch from app store
  const { dispatch } = useAppStore();
  const isLoading = useAppStore((s) => s.ui.loading.chatGeneration || false);

  // Get current messages from store
  const storedMessages = getCurrentMessages();

  // Local state for streaming message (to avoid global state updates during streaming)
  const [streamingMessage, setStreamingMessage] = useState<Message | null>(
    null
  );

  // Combine stored messages with streaming message for display
  const messages = streamingMessage
    ? [...storedMessages, streamingMessage]
    : storedMessages;

  const [inputMessage, setInputMessage] = useState("");
  const [openaiClient, setOpenaiClient] = useState<OpenAI | null>(null);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [lastMessageUpdateTime, setLastMessageUpdateTime] = useState<number>(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isUserScrolledUp, setIsUserScrolledUp] = useState(false);
  const isAutoScrollingRef = useRef(false);

  // Context attachment state
  const [attachmentSelectorOpen, setAttachmentSelectorOpen] = useState(false);
  const [attachmentButtonRef, setAttachmentButtonRef] =
    useState<HTMLElement | null>(null);

  // History menu state
  const [historyMenuAnchor, setHistoryMenuAnchor] =
    useState<null | HTMLElement>(null);
  const historyMenuOpen = Boolean(historyMenuAnchor);

  // Real data from API
  const [availableCollections, setAvailableCollections] = useState<
    Collection[]
  >([]);
  const [availableViews, setAvailableViews] = useState<View[]>([]);

  // Get custom prompt content
  const { content: customPromptContent } = useCustomPrompt();

  // Initialize OpenAI client
  useEffect(() => {
    const apiKey = localStorage.getItem("openai_api_key");
    if (apiKey) {
      try {
        const client = new OpenAI({
          apiKey: apiKey,
          dangerouslyAllowBrowser: true,
        });
        setOpenaiClient(client);
        setError(null);
      } catch (err) {
        setError(
          "Failed to initialize OpenAI client. Please check your API key."
        );
      }
    } else {
      setOpenaiClient(null);
      setError("No OpenAI API key found. Please configure it in Settings.");
    }
  }, []);

  // Auto-scroll to bottom
  // Removed duplicate - now handled by the improved useEffect that tracks streaming updates
  // useEffect(() => {
  //   messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  // }, [messages]);

  // Fetch collections and views
  const fetchCollections = useCallback(async () => {
    try {
      // 1) Get list of databases defined in the backend configuration
      const dbRes = await fetch("/api/databases");
      const dbData = await dbRes.json();
      if (!dbData.success) return;

      const allCollections: Collection[] = [];

      // Loop over each database and gather its collections + extra info
      for (const db of dbData.data as any[]) {
        const dbId = db.id;
        const dbName = db.name || dbId;

        try {
          const colRes = await fetch(
            `/api/databases/${encodeURIComponent(dbId)}/collections`
          );
          const colData = await colRes.json();
          if (!colData.success) continue;

          for (const col of colData.data as any[]) {
            let documentCount = 0;
            let sampleDocuments: any[] = [];
            let schemaInfo: any = {};

            try {
              // Get stats (count)
              const infoRes = await fetch(
                `/api/databases/${encodeURIComponent(dbId)}/collections/${encodeURIComponent(col.name)}`
              );
              const infoData = await infoRes.json();
              if (infoData.success) {
                documentCount = infoData.data?.stats?.count || 0;
              }
            } catch (e) {
              console.error(`Failed to fetch info for ${dbId}.${col.name}:`, e);
            }

            try {
              // Get sample docs + schema
              const sampleRes = await fetch(
                `/api/databases/${encodeURIComponent(dbId)}/collections/${encodeURIComponent(col.name)}/sample?size=3`
              );
              const sampleData = await sampleRes.json();
              if (sampleData.success) {
                sampleDocuments = sampleData.data.documents || [];
                schemaInfo = sampleData.data.schema || {};
              }
            } catch (e) {
              console.error(
                `Failed to fetch samples for ${dbId}.${col.name}:`,
                e
              );
            }

            allCollections.push({
              id: `${dbId}.${col.name}`,
              name: `${col.name} (${dbName})`,
              description: `MongoDB collection '${col.name}' in database '${dbName}' with ${documentCount} documents`,
              sampleDocument: sampleDocuments[0] || {},
              sampleDocuments,
              schemaInfo,
              documentCount,
            } as unknown as Collection);
          }
        } catch (e) {
          console.error(`Failed to list collections for database ${dbId}:`, e);
        }
      }

      setAvailableCollections(allCollections);
    } catch (error) {
      console.error("Failed to fetch collections:", error);
    }
  }, []);

  const fetchViews = useCallback(async () => {
    try {
      const dbRes = await fetch("/api/databases");
      const dbData = await dbRes.json();
      if (!dbData.success) return;

      const allViews: View[] = [];

      for (const db of dbData.data as any[]) {
        const dbId = db.id;
        const dbName = db.name || dbId;
        try {
          const viewRes = await fetch(
            `/api/databases/${encodeURIComponent(dbId)}/views`
          );
          const viewData = await viewRes.json();
          if (!viewData.success) continue;

          for (const view of viewData.data as any[]) {
            const viewOn = (view.options && view.options.viewOn) || "";
            const pipeline = (view.options && view.options.pipeline) || [];

            allViews.push({
              id: `${dbId}.${view.name}`,
              name: `${view.name} (${dbName})`,
              viewOn,
              pipeline,
              description: `View '${view.name}' on '${viewOn}' (DB: ${dbName})`,
            } as unknown as View);
          }
        } catch (e) {
          console.error(`Failed to list views for database ${dbId}:`, e);
        }
      }

      setAvailableViews(allViews);
    } catch (error) {
      console.error("Failed to fetch views:", error);
    }
  }, []);

  // Initial fetch on mount
  useEffect(() => {
    fetchCollections();
    fetchViews();
  }, [fetchCollections, fetchViews]);

  // Refresh lists each time the AttachmentSelector is opened
  useEffect(() => {
    if (attachmentSelectorOpen) {
      fetchCollections();
      fetchViews();
    }
  }, [attachmentSelectorOpen, fetchCollections, fetchViews]);

  // Fetch available OpenAI models once the client is initialized
  useEffect(() => {
    if (!openaiClient) return;

    const fetchModels = async () => {
      try {
        // List all models available for the provided API key
        const response = await openaiClient.models.list();
        const modelIds = (response.data as any).map(
          (m: any) => m.id
        ) as string[];

        // Optionally, prioritise chat-capable models (simple heuristic)
        const sorted = modelIds.sort((a, b) => a.localeCompare(b));
        setAvailableModels(sorted);

        // Ensure we have a valid selection
        if (sorted.length && !sorted.includes(selectedModel)) {
          setSelectedModel(sorted[0]);
        }
      } catch (err) {
        console.error("Failed to fetch available OpenAI models:", err);
      }
    };

    fetchModels();
  }, [openaiClient, selectedModel, setSelectedModel]);

  // Initialize first chat if none exists
  useEffect(() => {
    if (chatSessions.length === 0) {
      createNewChat();
    }
  }, [chatSessions.length, createNewChat]);

  // Clear streaming message when chat changes
  useEffect(() => {
    setStreamingMessage(null);
  }, [currentChatId]);

  // Context management
  const handleAttachClick = (event: React.MouseEvent<HTMLElement>) => {
    setAttachmentButtonRef(event.currentTarget);
    // Trigger a refresh before opening to ensure latest data
    fetchCollections();
    fetchViews();
    setAttachmentSelectorOpen(true);
  };

  const handleAttachmentSelectorClose = () => {
    setAttachmentSelectorOpen(false);
  };

  const addCollectionContext = (collection: Collection) => {
    // Build schema description
    let schemaDescription = "";
    if (
      collection.schemaInfo &&
      Object.keys(collection.schemaInfo).length > 0
    ) {
      schemaDescription = "\n\nSchema Analysis:\n";
      Object.entries(collection.schemaInfo).forEach(
        ([field, info]: [string, any]) => {
          schemaDescription += `- ${field}: ${info.types.join(" | ")}`;
          if (info.exampleValues.length > 0) {
            const examples = info.exampleValues
              .slice(0, 2)
              .map((v: any) =>
                typeof v === "object" ? JSON.stringify(v) : String(v)
              )
              .join(", ");
            schemaDescription += ` (e.g., ${examples})`;
          }
          schemaDescription += "\n";
        }
      );
    }

    // Include multiple sample documents
    let sampleDocumentsStr = "";
    if (collection.sampleDocuments && collection.sampleDocuments.length > 0) {
      sampleDocumentsStr = `\n\nSample Documents (${collection.sampleDocuments.length} shown):\n`;
      collection.sampleDocuments.forEach((doc, index) => {
        sampleDocumentsStr += `\n--- Document ${
          index + 1
        } ---\n${JSON.stringify(doc, null, 2)}\n`;
      });
    }

    const contextItem: AttachedContext = {
      id: `collection-${collection.id}-${Date.now()}`,
      type: "collection",
      title: collection.name,
      content: `Collection: ${collection.name}
Description: ${collection.description}
Document Count: ${collection.documentCount}${schemaDescription}${sampleDocumentsStr}`,
      metadata: {
        collectionName: collection.name,
      },
    };
    addContextItem(contextItem);
  };

  const addViewContext = (view: View) => {
    const contextItem: AttachedContext = {
      id: `view-${view.id}-${Date.now()}`,
      type: "view",
      title: `${view.name} (View)`,
      content: `View Name: ${view.name}\nView On: ${
        view.viewOn
      }\n\nPipeline:\n${JSON.stringify(view.pipeline, null, 2)}`,
      metadata: {
        fileName: `${view.name}.view.json`,
        language: "json",
      },
    };
    addContextItem(contextItem);
  };

  const addConsoleContext = (
    consoleId: string,
    content: string,
    title: string
  ) => {
    const contextItem: AttachedContext = {
      id: `console-${consoleId}-${Date.now()}`,
      type: "console",
      title: `${title} (Console)`,
      content: `Console: ${title}\n\nCurrent Content:\n${content}`,
      metadata: {
        fileName: `${title}.js`,
        language: "javascript",
        consoleId: consoleId,
      },
    };
    addContextItem(contextItem);
  };

  const createAndAttachNewConsole = (
    initialContent: string = "",
    title: string = "New Console"
  ) => {
    const consoleId = addConsoleTab({
      title,
      content: initialContent,
      initialContent: initialContent,
    });
    addConsoleContext(consoleId, initialContent, title);
    setActiveConsole(consoleId);
    return consoleId;
  };

  // Function to extract code blocks from markdown
  const extractCodeFromMarkdown = (
    content: string
  ): { code: string; language: string } | null => {
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/;
    const match = content.match(codeBlockRegex);
    if (match) {
      return {
        language: match[1] || "javascript",
        code: match[2].trim(),
      };
    }
    return null;
  };

  // Function to update console with code from AI response
  const updateConsoleFromAIResponse = (response: string) => {
    // Check if there's an attached console
    const attachedConsole = attachedContext.find(
      (ctx) => ctx.type === "console"
    );
    if (attachedConsole && attachedConsole.metadata?.consoleId) {
      const codeBlock = extractCodeFromMarkdown(response);
      if (codeBlock) {
        // Update the console content
        updateConsoleContent(
          attachedConsole.metadata.consoleId,
          codeBlock.code
        );
      }
    }
  };

  // Function to execute console code automatically
  const executeConsoleCode = async (): Promise<any> => {
    const attachedConsole = attachedContext.find(
      (ctx) => ctx.type === "console"
    );
    if (!attachedConsole || !attachedConsole.metadata?.consoleId) {
      return null;
    }

    const consoleTab = consoleTabs.find(
      (tab) => tab.id === attachedConsole.metadata!.consoleId
    );
    if (!consoleTab || !consoleTab.content.trim()) {
      return null;
    }

    try {
      const response = await fetch(`/api/execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content: consoleTab.content }),
      });

      const data = await response.json();
      return data;
    } catch (error) {
      console.error("Failed to execute query:", error);
      return { success: false, error: String(error) };
    }
  };

  const sendMessage = async () => {
    if (!inputMessage.trim() || !openaiClient || isLoading) return;

    const userMessage = inputMessage.trim();
    const currentContext = [...attachedContext];
    setInputMessage("");
    setError(null);
    dispatch({
      type: "SET_LOADING",
      payload: { key: "chatGeneration", value: true },
    });

    // Reset user scroll state when sending a new message
    setIsUserScrolledUp(false);

    // Clear any existing streaming message
    setStreamingMessage(null);

    // 0️⃣  Persist the user's message locally so it appears immediately in the UI
    const userMessageObj: Message = {
      id: Date.now().toString() + Math.random(),
      role: "user",
      content: userMessage,
      timestamp: new Date(),
      attachedContext: currentContext,
    };
    addMessage(userMessageObj);

    // 1️⃣  Previous chat history (excluding system prompt)
    const priorMessages = storedMessages.map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    }));

    // 2️⃣  Convert each attached context item into its own system message so it is
    //     clearly separated and always included in the prompt.
    const contextSystemMessages = currentContext.map((ctx, idx) => ({
      role: "system" as const,
      content: `Attached Context #${idx + 1}: ${ctx.title}\n\n${ctx.content}`,
    }));

    // 3️⃣  The actual user question (without the context embedded)
    const userPromptMessage = { role: "user" as const, content: userMessage };

    // Combine everything for the OpenAI request
    const conversationHistory = [
      ...contextSystemMessages,
      ...priorMessages,
      userPromptMessage,
    ];

    // Prepare an empty assistant message used during streaming so the UI can update live
    const assistantStreamingId = `assistant-${Date.now()}-${Math.random()}`;
    const initialStreamingMessage: Message = {
      id: assistantStreamingId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
      attachedContext: [],
    };
    setStreamingMessage(initialStreamingMessage);

    try {
      // Combine system prompt with custom prompt
      const combinedSystemPrompt = customPromptContent.trim()
        ? `${systemPromptContent}\n\n--- Custom Context ---\n${customPromptContent}`
        : systemPromptContent;

      // 4. Call the OpenAI chat completion endpoint with streaming enabled
      const completionStream: AsyncIterable<any> = await (
        openaiClient.chat.completions.create as any
      )({
        model: selectedModel,
        messages: [
          {
            role: "system",
            content: combinedSystemPrompt,
          },
          ...conversationHistory,
        ],
        ...(selectedModel.toLowerCase().startsWith("o3") ||
        selectedModel.toLowerCase().includes("gpt-4o")
          ? { max_completion_tokens: 10000 }
          : { max_tokens: 10000 }),
        ...(!selectedModel.toLowerCase().startsWith("o3") &&
        !selectedModel.toLowerCase().includes("gpt-4o")
          ? { temperature: 0.7 }
          : {}),
        stream: true,
      });

      // 5. Iterate over the streamed chunks and update the local streaming message
      let fullResponse = "";
      for await (const chunk of completionStream) {
        const delta: string = chunk?.choices?.[0]?.delta?.content || "";
        if (delta) {
          fullResponse += delta;
          // Update local streaming message instead of global state
          setStreamingMessage((prev) =>
            prev
              ? {
                  ...prev,
                  content: prev.content + delta,
                }
              : null
          );
          // Trigger re-render for auto-scroll during streaming
          setLastMessageUpdateTime(Date.now());
          // Force immediate scroll during streaming only if user hasn't scrolled up
          if (!isUserScrolledUp) {
            requestAnimationFrame(() => {
              if (scrollContainerRef.current) {
                isAutoScrollingRef.current = true;
                scrollContainerRef.current.scrollTop =
                  scrollContainerRef.current.scrollHeight;
                setTimeout(() => {
                  isAutoScrollingRef.current = false;
                }, 100);
              }
            });
          }
        }
      }

      // 6. After streaming is complete, save the final message to global state
      const finalMessage: Message = {
        id: assistantStreamingId,
        role: "assistant",
        content: fullResponse,
        timestamp: new Date(),
        attachedContext: [],
      };
      addMessage(finalMessage);

      // After streaming is complete, check if we should update a console
      updateConsoleFromAIResponse(fullResponse);

      // Check for execution marker and handle automatic execution
      if (fullResponse.includes("[[EXECUTE_CONSOLE]]")) {
        // Execute the console code after a short delay
        setTimeout(async () => {
          const result = await executeConsoleCode();

          // Format the results
          let resultContent = "";
          if (result?.success) {
            if (result.data?.results) {
              resultContent = `✅ Execution successful!\n\nResults (${
                result.data.resultCount
              } documents):\n\`\`\`json\n${JSON.stringify(
                result.data.results,
                null,
                2
              )}\n\`\`\``;
            } else {
              resultContent = `✅ Execution successful!\n\nResult:\n\`\`\`json\n${JSON.stringify(
                result.data,
                null,
                2
              )}\n\`\`\``;
            }
          } else {
            resultContent = `❌ Execution failed:\n\`\`\`\n${
              result?.error || "Unknown error"
            }\n\`\`\``;
          }

          // Add execution results as a new message
          const executionResultMessage: Message = {
            id: `exec-result-${Date.now()}-${Math.random()}`,
            role: "assistant",
            content: resultContent,
            timestamp: new Date(),
            attachedContext: [],
          };
          addMessage(executionResultMessage);

          // Add a system message prompting for analysis
          const analysisPromptMessage: Message = {
            id: `analysis-prompt-${Date.now()}-${Math.random()}`,
            role: "user",
            content:
              "Please analyze the execution results above. If they don't meet the requirements, feel free to modify the code and add [[EXECUTE_CONSOLE]] to run it again.",
            timestamp: new Date(),
            attachedContext: [],
          };
          addMessage(analysisPromptMessage);

          // Trigger a new AI response for analysis
          // This will be handled by the user sending the next message
        }, 1000);
      }

      // Clear the temporary streaming message
      setStreamingMessage(null);
    } catch (err: any) {
      console.error("OpenAI API error:", err);
      // Clear streaming message on error
      setStreamingMessage(null);
      if (err.status === 401) {
        setError(
          "Invalid API key. Please check your OpenAI API key in Settings."
        );
      } else if (err.status === 429) {
        setError("Rate limit exceeded. Please try again later.");
      } else {
        setError(
          `Error: ${err.message || "Failed to get response from OpenAI"}`
        );
      }
    } finally {
      dispatch({
        type: "SET_LOADING",
        payload: { key: "chatGeneration", value: false },
      });
    }
  };

  // History menu handlers
  const handleHistoryMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setHistoryMenuAnchor(event.currentTarget);
  };

  const handleHistoryMenuClose = () => {
    setHistoryMenuAnchor(null);
  };

  const handleSelectChat = (chatId: string) => {
    setCurrentChat(chatId);
    handleHistoryMenuClose();
  };

  const handleDeleteChat = (chatId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    deleteChat(chatId);
  };

  const handleNewChat = () => {
    createNewChat();
    setError(null);
  };

  // Discrete loading notice shown while assistant is generating a response
  const LoadingNotice: React.FC = () => (
    <Box sx={{ display: "flex", justifyContent: "flex-start", m: 0.5 }}>
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        Generating...
      </Typography>
    </Box>
  );

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    if (scrollContainerRef.current && !isUserScrolledUp) {
      const scrollContainer = scrollContainerRef.current;
      // Use instant scrolling during streaming for better responsiveness
      const scrollBehavior = isLoading ? "instant" : behavior;

      requestAnimationFrame(() => {
        isAutoScrollingRef.current = true;
        scrollContainer.scrollTo({
          top: scrollContainer.scrollHeight,
          behavior: scrollBehavior as ScrollBehavior,
        });
        setTimeout(() => {
          isAutoScrollingRef.current = false;
        }, 100);
      });
    }
  };

  // Detect if user has scrolled up
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    const handleScroll = () => {
      // Skip if we're auto-scrolling
      if (isAutoScrollingRef.current) return;

      const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 20; // 20px threshold

      setIsUserScrolledUp(!isAtBottom);
    };

    scrollContainer.addEventListener("scroll", handleScroll);
    return () => scrollContainer.removeEventListener("scroll", handleScroll);
  }, []);

  // Auto-scroll to bottom when new messages are added (not during streaming)
  useEffect(() => {
    // Only auto-scroll for new messages if user hasn't scrolled up
    if (!isLoading && !isUserScrolledUp && messages.length > 0) {
      scrollToBottom("smooth");
    }
  }, [messages.length, isLoading, isUserScrolledUp]);

  // Auto-scroll during streaming updates
  useEffect(() => {
    // Only scroll during streaming if user hasn't scrolled up
    if (isLoading && !isUserScrolledUp) {
      scrollToBottom("instant");
    }
  }, [lastMessageUpdateTime, isLoading, isUserScrolledUp]);

  // Scroll to bottom instantly when component mounts or chat changes
  useEffect(() => {
    // Always scroll to bottom on mount/chat change
    setIsUserScrolledUp(false);

    // Use instant scroll on mount/chat change for immediate positioning
    const scrollToBottomInstant = () => {
      if (scrollContainerRef.current) {
        isAutoScrollingRef.current = true;
        scrollContainerRef.current.scrollTop =
          scrollContainerRef.current.scrollHeight;
        setTimeout(() => {
          isAutoScrollingRef.current = false;
        }, 100);
      }
    };

    // Double requestAnimationFrame to ensure DOM is fully painted
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollToBottomInstant();
      });
    });
  }, [currentChatId]); // Also triggers when switching between chats

  if (!openaiClient) {
    return (
      <Box
        sx={{
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          p: 3,
        }}
      >
        <Alert severity="warning" sx={{ maxWidth: 400 }}>
          <Typography variant="h6" gutterBottom>
            OpenAI API Key Required
          </Typography>
          <Typography>
            Please configure your OpenAI API key in Settings to use the AI
            Assistant.
          </Typography>
        </Alert>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        height: "100%",
        p: 1,
      }}
    >
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 1,
        }}
      >
        <Typography variant="h6">AI Assistant</Typography>
        <Box sx={{ display: "flex", gap: 1 }}>
          <IconButton
            size="small"
            onClick={handleHistoryMenuOpen}
            disabled={chatSessions.length === 0}
          >
            <HistoryIcon />
          </IconButton>
          <Button size="small" startIcon={<AddIcon />} onClick={handleNewChat}>
            New Chat
          </Button>
        </Box>
      </Box>

      {/* History Menu */}
      <Menu
        anchorEl={historyMenuAnchor}
        open={historyMenuOpen}
        onClose={handleHistoryMenuClose}
        PaperProps={{
          sx: { maxHeight: 400, width: 300 },
        }}
      >
        {chatSessions
          .filter(
            (chat) => chat.messages.length > 0 || chat.id === currentChatId
          )
          .map((chat) => (
            <MenuItem
              key={chat.id}
              onClick={() => handleSelectChat(chat.id)}
              selected={chat.id === currentChatId}
              sx={{ display: "flex", justifyContent: "space-between" }}
            >
              <Box sx={{ display: "flex", alignItems: "center", flex: 1 }}>
                <ListItemIcon>
                  <ChatIcon fontSize="small" />
                </ListItemIcon>
                <Box>
                  <ListItemText
                    primary={chat.title}
                    secondary={
                      chat.lastMessageAt
                        ? new Date(chat.lastMessageAt).toLocaleDateString()
                        : new Date(chat.createdAt).toLocaleDateString()
                    }
                    primaryTypographyProps={{
                      noWrap: true,
                      sx: { maxWidth: 200 },
                    }}
                  />
                </Box>
              </Box>
              {(chat.messages.length > 0 || chat.id !== currentChatId) && (
                <IconButton
                  size="small"
                  onClick={(e) => handleDeleteChat(chat.id, e)}
                  sx={{ ml: 1 }}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              )}
            </MenuItem>
          ))}
        {chatSessions.filter((chat) => chat.messages.length > 0).length ===
          0 && (
          <MenuItem disabled>
            <Typography variant="body2" color="text.secondary">
              No chat history yet
            </Typography>
          </MenuItem>
        )}
      </Menu>

      {/* Error notice (shown above the input) */}
      {error && (
        <Box sx={{ p: 2 }}>
          <Alert severity="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        </Box>
      )}

      {/* Messages area – grows only after first message so the input stays at bottom */}
      <Box
        ref={scrollContainerRef}
        sx={{
          flex: messages.length > 0 ? 1 : 0,
          display: "flex",
          flexDirection: "column",
          overflow: "auto",
          pb: 2,
        }}
      >
        <MessageList messages={messages} />

        <div ref={messagesEndRef} />
      </Box>

      {/* Loading indicator */}
      {isLoading && <LoadingNotice />}

      {/* Single user input */}
      <UserInput
        inputMessage={inputMessage}
        setInputMessage={setInputMessage}
        attachedContext={attachedContext}
        removeContextItem={removeContextItem}
        onSend={sendMessage}
        onAttachClick={handleAttachClick}
        isLoading={isLoading}
        availableModels={availableModels}
        selectedModel={selectedModel}
        setSelectedModel={setSelectedModel}
      />

      <AttachmentSelector
        open={attachmentSelectorOpen}
        anchorEl={attachmentButtonRef}
        onClose={handleAttachmentSelectorClose}
        availableCollections={availableCollections}
        availableViews={availableViews}
        onAttachCollection={addCollectionContext}
        onAttachView={addViewContext}
        onAttachConsole={addConsoleContext}
        onCreateNewConsole={() => createAndAttachNewConsole("", "New Console")}
      />
    </Box>
  );
};

export default Chat;
