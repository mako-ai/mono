import React, { useState, useEffect, useRef } from "react";
import {
  Box,
  Typography,
  Button,
  Alert,
  CircularProgress,
  Paper,
  Avatar,
} from "@mui/material";
import { SmartToy } from "@mui/icons-material";
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

// For now, let's define the system prompt as a constant
// In a production app, you could load this from a file
const systemPromptContent =
  "You are a MongoDB expert and your goal is to help write view definitions. Always respond with the full definition and never truncate your code.";

const Chat: React.FC<ChatProps> = ({ currentEditorContent }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openaiClient, setOpenaiClient] = useState<OpenAI | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Context attachment state
  const [attachedContext, setAttachedContext] = useState<AttachedContext[]>([]);
  const [contextMenuAnchor, setContextMenuAnchor] =
    useState<null | HTMLElement>(null);
  const [collectionsDialogOpen, setCollectionsDialogOpen] = useState(false);
  const [definitionsDialogOpen, setDefinitionsDialogOpen] = useState(false);
  const [viewsDialogOpen, setViewsDialogOpen] = useState(false);

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
        const response = await fetch("/api/database/collections");
        const data = await response.json();
        if (data.success) {
          const collectionsWithSamples = await Promise.all(
            data.data.map(async (col: any) => {
              try {
                const statsResponse = await fetch(
                  `/api/database/collections/${encodeURIComponent(
                    col.name
                  )}/info`
                );
                const statsData = await statsResponse.json();

                const sampleResponse = await fetch("/api/database/query", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    query: `db.${col.name}.findOne({})`,
                  }),
                });
                const sampleData = await sampleResponse.json();

                return {
                  id: col.name,
                  name: col.name,
                  description: `MongoDB collection with ${
                    statsData.success ? statsData.data.stats?.count || 0 : 0
                  } documents`,
                  sampleDocument:
                    sampleData.success && sampleData.data?.length > 0
                      ? sampleData.data[0]
                      : {},
                  documentCount: statsData.success
                    ? statsData.data.stats?.count || 0
                    : 0,
                };
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

  // Context management
  const addContextItem = (item: AttachedContext) => {
    setAttachedContext((prev) => [...prev, item]);
  };

  const removeContextItem = (id: string) => {
    setAttachedContext((prev) => prev.filter((item) => item.id !== id));
  };

  const handleContextMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setContextMenuAnchor(event.currentTarget);
  };

  const handleContextMenuClose = () => {
    setContextMenuAnchor(null);
  };

  const addCollectionContext = (collection: Collection) => {
    const contextItem: AttachedContext = {
      id: `collection-${collection.id}-${Date.now()}`,
      type: "collection",
      title: collection.name,
      content: `Collection: ${collection.name}\nDescription: ${
        collection.description
      }\nDocument Count: ${
        collection.documentCount
      }\n\nSample Document:\n${JSON.stringify(
        collection.sampleDocument,
        null,
        2
      )}`,
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

  const addMessage = (
    role: "user" | "assistant",
    content: string,
    context?: AttachedContext[]
  ) => {
    const newMessage: Message = {
      id: Date.now().toString() + Math.random(),
      role,
      content,
      timestamp: new Date(),
      attachedContext: context,
    };
    setMessages((prev) => [...prev, newMessage]);
  };

  const sendMessage = async () => {
    if (!inputMessage.trim() || !openaiClient || isLoading) return;

    const userMessage = inputMessage.trim();
    const currentContext = [...attachedContext];
    setInputMessage("");
    setAttachedContext([]);
    setError(null);
    setIsLoading(true);

    addMessage("user", userMessage, currentContext);

    try {
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

      const completion = await openaiClient.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: systemPromptContent,
          },
          ...conversationHistory,
        ],
        max_tokens: 4000,
        temperature: 0.7,
      });

      const assistantResponse = completion.choices[0]?.message?.content;
      if (assistantResponse) {
        addMessage("assistant", assistantResponse);
      } else {
        setError("No response received from OpenAI");
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

  const clearChat = () => {
    setMessages([]);
    setError(null);
  };

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
      <Box sx={{ display: "flex", justifyContent: "space-between" }}>
        <Typography variant="h6" gutterBottom>
          AI Assistant
        </Typography>
        <Button
          size="small"
          onClick={clearChat}
          disabled={messages.length === 0}
          sx={{ alignSelf: "flex-end" }}
        >
          Clear Chat
        </Button>
      </Box>

      {messages.length === 0 ? (
        <>
          {error && (
            <Box sx={{ p: 2 }}>
              <Alert severity="error" onClose={() => setError(null)}>
                {error}
              </Alert>
            </Box>
          )}

          <UserInput
            inputMessage={inputMessage}
            setInputMessage={setInputMessage}
            attachedContext={attachedContext}
            removeContextItem={removeContextItem}
            onSend={sendMessage}
            onAttachClick={handleContextMenuOpen}
            isLoading={isLoading}
          />

          {isLoading && (
            <Box
              sx={{
                flex: 1,
                display: "flex",
                justifyContent: "flex-start",
                mt: 2,
              }}
            >
              <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
                <Avatar
                  sx={{ width: 32, height: 32, bgcolor: "secondary.main" }}
                >
                  <SmartToy />
                </Avatar>
                <Paper elevation={1} sx={{ p: 2, bgcolor: "grey.100" }}>
                  <CircularProgress size={20} />
                  <Typography variant="body2" sx={{ ml: 1, display: "inline" }}>
                    Thinking...
                  </Typography>
                </Paper>
              </Box>
            </Box>
          )}
        </>
      ) : (
        <>
          <MessageList messages={messages} />

          {isLoading && (
            <Box sx={{ display: "flex", justifyContent: "flex-start", mb: 1 }}>
              <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
                <Avatar
                  sx={{ width: 32, height: 32, bgcolor: "secondary.main" }}
                >
                  <SmartToy />
                </Avatar>
                <Paper elevation={1} sx={{ p: 2, bgcolor: "grey.100" }}>
                  <CircularProgress size={20} />
                  <Typography variant="body2" sx={{ ml: 1, display: "inline" }}>
                    Thinking...
                  </Typography>
                </Paper>
              </Box>
            </Box>
          )}

          <div ref={messagesEndRef} />

          {error && (
            <Box sx={{ p: 2 }}>
              <Alert severity="error" onClose={() => setError(null)}>
                {error}
              </Alert>
            </Box>
          )}

          <UserInput
            inputMessage={inputMessage}
            setInputMessage={setInputMessage}
            attachedContext={attachedContext}
            removeContextItem={removeContextItem}
            onSend={sendMessage}
            onAttachClick={handleContextMenuOpen}
            isLoading={isLoading}
          />
        </>
      )}

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
