import React, { useState, useEffect, useRef } from "react";
import {
  Box,
  Typography,
  Button,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
  Menu,
  ListItemText,
  ListItemIcon,
} from "@mui/material";
import OpenAI from "openai";
import UserInput from "./UserInput";
import MessageList from "./MessageList";
import AttachmentSelector from "./AttachmentSelector";
import {
  ChatProps,
  Message,
  AttachedContext,
  Collection,
  View,
  Definition,
} from "./types";
import { systemPromptContent } from "./SystemPrompt";
import { useChatStore } from "../../store/chatStore";
import {
  History as HistoryIcon,
  Add as AddIcon,
  Chat as ChatIcon,
  Delete as DeleteIcon,
} from "@mui/icons-material";

const Chat: React.FC<ChatProps> = ({ currentEditorContent }) => {
  // Get state and actions from Zustand store
  const {
    chatSessions,
    currentChatId,
    createNewChat,
    setCurrentChat,
    deleteChat,
    getCurrentMessages,
    addMessage,
    updateMessage,
    attachedContext,
    addContextItem,
    removeContextItem,
    selectedModel,
    setSelectedModel,
    error,
    setError,
  } = useChatStore();

  // Get current messages
  const messages = getCurrentMessages();

  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [openaiClient, setOpenaiClient] = useState<OpenAI | null>(null);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Context attachment state
  const [contextMenuAnchor, setContextMenuAnchor] =
    useState<null | HTMLElement>(null);
  const [collectionsDialogOpen, setCollectionsDialogOpen] = useState(false);
  const [definitionsDialogOpen, setDefinitionsDialogOpen] = useState(false);
  const [viewsDialogOpen, setViewsDialogOpen] = useState(false);

  // History menu state
  const [historyMenuAnchor, setHistoryMenuAnchor] =
    useState<null | HTMLElement>(null);
  const historyMenuOpen = Boolean(historyMenuAnchor);

  // Real data from API
  const [availableCollections, setAvailableCollections] = useState<
    Collection[]
  >([]);
  const [availableViews, setAvailableViews] = useState<View[]>([]);
  const [availableDefinitions] = useState<Definition[]>([
    {
      id: "1",
      name: "calculateRevenue",
      type: "function",
      content:
        "function calculateRevenue(orders: Order[]): number {\n  return orders.reduce((sum, order) => sum + order.amount, 0);\n}",
      fileName: "revenue.ts",
      lineNumbers: "15-17",
    },
    {
      id: "2",
      name: "UserInterface",
      type: "interface",
      content:
        "interface User {\n  id: number;\n  name: string;\n  email: string;\n  role: 'admin' | 'user';\n}",
      fileName: "types.ts",
      lineNumbers: "1-6",
    },
  ]);

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
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Fetch collections and views
  useEffect(() => {
    const fetchCollections = async () => {
      try {
        const response = await fetch("/api/collections");
        const data = await response.json();
        if (data.success) {
          const collectionsWithSamples = await Promise.all(
            data.data.map(async (col: any) => {
              try {
                // Fetch collection info
                const infoResponse = await fetch(
                  `/api/collections/${encodeURIComponent(col.name)}`
                );
                const infoData = await infoResponse.json();
                console.log(`Info for ${col.name}:`, infoData);

                // Fetch sample documents with schema analysis
                const sampleResponse = await fetch(
                  `/api/collections/${encodeURIComponent(
                    col.name
                  )}/sample?size=5`
                );
                const sampleData = await sampleResponse.json();
                console.log(`Sample data for ${col.name}:`, sampleData);

                const documentCount = infoData.success
                  ? infoData.data?.stats?.count || 0
                  : 0;

                const collectionInfo = {
                  id: col.name,
                  name: col.name,
                  description: `MongoDB collection with ${documentCount} documents`,
                  sampleDocument: sampleData.data?.documents?.[0] || {},
                  sampleDocuments: sampleData.data?.documents || [],
                  schemaInfo: sampleData.data?.schema || {},
                  documentCount,
                };

                console.log(`Collection info for ${col.name}:`, collectionInfo);
                return collectionInfo;
              } catch (error) {
                console.error(
                  `Failed to fetch details for collection ${col.name}:`,
                  error
                );
                return {
                  id: col.name,
                  name: col.name,
                  description: "MongoDB collection",
                  sampleDocument: {},
                  sampleDocuments: [],
                  schemaInfo: {},
                  documentCount: 0,
                };
              }
            })
          );
          setAvailableCollections(collectionsWithSamples);
        }
      } catch (error) {
        console.error("Failed to fetch collections:", error);
      }
    };

    const fetchViews = async () => {
      try {
        const response = await fetch("/api/database/views");
        const data = await response.json();
        if (data.success) {
          const views = data.data.map((view: any) => ({
            id: view.name,
            name: view.name,
            viewOn: view.viewOn,
            pipeline: view.pipeline || [],
            description: `View on ${view.viewOn} collection`,
          }));
          setAvailableViews(views);
        }
      } catch (error) {
        console.error("Failed to fetch views:", error);
      }
    };

    fetchCollections();
    fetchViews();
  }, []);

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
  }, [openaiClient]);

  // Initialize first chat if none exists
  useEffect(() => {
    if (chatSessions.length === 0) {
      createNewChat();
    }
  }, [chatSessions.length, createNewChat]);

  // Context management
  const handleContextMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setContextMenuAnchor(event.currentTarget);
  };

  const handleContextMenuClose = () => {
    setContextMenuAnchor(null);
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
    setCollectionsDialogOpen(false);
    handleContextMenuClose();
  };

  const addDefinitionContext = (definition: Definition) => {
    const contextItem: AttachedContext = {
      id: `definition-${definition.id}-${Date.now()}`,
      type: "definition",
      title: `${definition.name} (${definition.type})`,
      content: definition.content,
      metadata: {
        fileName: definition.fileName,
        lineNumbers: definition.lineNumbers,
      },
    };
    addContextItem(contextItem);
    setDefinitionsDialogOpen(false);
    handleContextMenuClose();
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
    setViewsDialogOpen(false);
    handleContextMenuClose();
  };

  const addEditorContext = () => {
    if (!currentEditorContent || !currentEditorContent.content.trim()) {
      setError("No editor content available to attach");
      handleContextMenuClose();
      return;
    }

    const contextItem: AttachedContext = {
      id: `editor-${Date.now()}`,
      type: "editor",
      title: currentEditorContent.fileName
        ? `Editor: ${currentEditorContent.fileName}`
        : "Current Editor Content",
      content: currentEditorContent.content,
      metadata: {
        fileName: currentEditorContent.fileName || "untitled",
        language: currentEditorContent.language || "text",
      },
    };
    addContextItem(contextItem);
    handleContextMenuClose();
  };

  const sendMessage = async () => {
    if (!inputMessage.trim() || !openaiClient || isLoading) return;

    const userMessage = inputMessage.trim();
    const currentContext = [...attachedContext];
    setInputMessage("");
    setError(null);
    setIsLoading(true);

    // 1. Add the user message first so it appears in the UI immediately
    const userMessageObj: Message = {
      id: Date.now().toString() + Math.random(),
      role: "user",
      content: userMessage,
      timestamp: new Date(),
      attachedContext: currentContext,
    };
    addMessage(userMessageObj);

    try {
      // Build conversation history for the API call (excluding system prompt)
      const conversationHistory = messages.map((msg) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      }));

      let messageContent = userMessage;
      if (currentContext.length > 0) {
        messageContent += "\n\n--- Attached Context ---\n";
        currentContext.forEach((context, index) => {
          messageContent += `\n${index + 1}. ${context.title}:\n${
            context.content
          }\n`;
        });
      }

      conversationHistory.push({ role: "user", content: messageContent });

      const isO3 =
        selectedModel.toLowerCase().startsWith("o3") ||
        selectedModel.toLowerCase().includes("gpt-4o");

      // 2. Prepare an empty assistant message that we will progressively fill as we receive streamed chunks
      const assistantMessageId = `assistant-${Date.now()}-${Math.random()}`;
      const assistantMessage: Message = {
        id: assistantMessageId,
        role: "assistant",
        content: "", // will be filled incrementally
        timestamp: new Date(),
        attachedContext: [],
      };
      addMessage(assistantMessage);

      // 3. Call the OpenAI chat completion endpoint with streaming enabled
      const completionStream: AsyncIterable<any> = await (
        openaiClient.chat.completions.create as any
      )({
        model: selectedModel,
        messages: [
          {
            role: "system",
            content: systemPromptContent,
          },
          ...conversationHistory,
        ],
        ...(isO3 ? { max_completion_tokens: 4000 } : { max_tokens: 4000 }),
        ...(!isO3 ? { temperature: 0.7 } : {}),
        stream: true,
      });

      // 4. Iterate over the streamed chunks and update the assistant message content in real-time
      for await (const chunk of completionStream) {
        const delta: string = chunk?.choices?.[0]?.delta?.content || "";
        if (delta) {
          updateMessage(assistantMessageId, delta);
        }
      }
    } catch (err: any) {
      console.error("OpenAI API error:", err);
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
      setIsLoading(false);
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
    <Box sx={{ display: "flex", justifyContent: "flex-start", mt: 2 }}>
      <Typography
        variant="body2"
        sx={{ fontStyle: "italic", color: "text.secondary" }}
      >
        Generating...
      </Typography>
    </Box>
  );

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
        sx={{
          flex: messages.length > 0 ? 1 : 0,
          display: "flex",
          flexDirection: "column",
          overflow: "auto",
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
        onAttachClick={handleContextMenuOpen}
        isLoading={isLoading}
      />

      {/* Model selection dropdown */}
      <Box sx={{ mt: 1 }}>
        <FormControl
          size="small"
          sx={{ minWidth: 200 }}
          disabled={availableModels.length === 0}
        >
          <InputLabel id="model-select-label">Model</InputLabel>
          <Select
            labelId="model-select-label"
            label="Model"
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value as string)}
          >
            {availableModels.map((modelId) => (
              <MenuItem key={modelId} value={modelId}>
                {modelId}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      <AttachmentSelector
        contextMenuAnchor={contextMenuAnchor}
        onClose={handleContextMenuClose}
        collectionsDialogOpen={collectionsDialogOpen}
        setCollectionsDialogOpen={setCollectionsDialogOpen}
        definitionsDialogOpen={definitionsDialogOpen}
        setDefinitionsDialogOpen={setDefinitionsDialogOpen}
        viewsDialogOpen={viewsDialogOpen}
        setViewsDialogOpen={setViewsDialogOpen}
        availableCollections={availableCollections}
        availableDefinitions={availableDefinitions}
        availableViews={availableViews}
        onAttachCollection={addCollectionContext}
        onAttachDefinition={addDefinitionContext}
        onAttachView={addViewContext}
        onAttachEditorContent={addEditorContext}
      />
    </Box>
  );
};

export default Chat;
