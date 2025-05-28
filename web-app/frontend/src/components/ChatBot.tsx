import React, { useState, useEffect, useRef } from "react";
import {
  Box,
  Typography,
  TextField,
  Button,
  Paper,
  CircularProgress,
  Alert,
  Avatar,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import {
  Send as SendIcon,
  SmartToy,
  Person,
  AttachFile,
  Code,
  Storage,
  Description,
  ExpandMore,
  Close,
  TableView,
} from "@mui/icons-material";
import OpenAI from "openai";

interface ChatBotProps {
  currentEditorContent?: {
    content: string;
    fileName?: string;
    language?: string;
  };
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  attachedContext?: AttachedContext[];
}

interface AttachedContext {
  id: string;
  type: "collection" | "definition" | "editor" | "view";
  title: string;
  content: string;
  metadata?: {
    fileName?: string;
    language?: string;
    lineNumbers?: string;
    collectionName?: string;
  };
}

interface Collection {
  id: string;
  name: string;
  description?: string;
  sampleDocument: any;
  documentCount: number;
}

interface View {
  id: string;
  name: string;
  viewOn: string;
  pipeline: any[];
  description?: string;
}

interface Definition {
  id: string;
  name: string;
  type: "function" | "class" | "interface" | "type";
  content: string;
  fileName: string;
  lineNumbers: string;
}

const ChatBot: React.FC<ChatBotProps> = ({ currentEditorContent }) => {
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

  // Initialize OpenAI client when component mounts or API key changes
  useEffect(() => {
    const apiKey = localStorage.getItem("openai_api_key");
    if (apiKey) {
      try {
        const client = new OpenAI({
          apiKey: apiKey,
          dangerouslyAllowBrowser: true, // Required for browser usage
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

  // Auto-scroll to bottom when new messages are added
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Fetch real collections and views data
  useEffect(() => {
    const fetchCollections = async () => {
      try {
        const response = await fetch("/api/database/collections");
        const data = await response.json();
        if (data.success) {
          const collectionsWithSamples = await Promise.all(
            data.data.map(async (col: any) => {
              try {
                // Get collection stats
                const statsResponse = await fetch(
                  `/api/database/collections/${encodeURIComponent(
                    col.name
                  )}/info`
                );
                const statsData = await statsResponse.json();

                // Get a sample document
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

  // Context management functions
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
    setAttachedContext([]); // Clear attached context
    setError(null);
    setIsLoading(true);

    // Add user message to chat with context
    addMessage("user", userMessage, currentContext);

    try {
      // Prepare conversation history for OpenAI
      const conversationHistory = messages.map((msg) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      }));

      // Build the current message content with context
      let messageContent = userMessage;
      if (currentContext.length > 0) {
        messageContent += "\n\n--- Attached Context ---\n";
        currentContext.forEach((context, index) => {
          messageContent += `\n${index + 1}. ${context.title}:\n${
            context.content
          }\n`;
        });
      }

      // Add the current user message with context
      conversationHistory.push({ role: "user", content: messageContent });

      // Call OpenAI API
      const completion = await openaiClient.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content:
              "You are a MongoDB expert and your goal is to help write view definitions. Always respond witht the full definition and never truncate your code.",
          },
          ...conversationHistory,
        ],
        max_tokens: 500,
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

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
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
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <Button
        size="small"
        onClick={clearChat}
        disabled={messages.length === 0}
        sx={{ alignSelf: "flex-end" }}
      >
        Clear Chat
      </Button>

      {/* Messages Area */}
      <Box
        sx={{
          flex: 1,
          overflow: "auto",
          p: 2,
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        {messages.length === 0 && (
          <Box
            sx={{
              textAlign: "center",
              color: "text.secondary",
              mt: 4,
            }}
          >
            <SmartToy sx={{ fontSize: 48, mb: 2, opacity: 0.5 }} />
            <Typography variant="h6" gutterBottom>
              Welcome to the AI Assistant!
            </Typography>
            <Typography>
              Ask me anything about RevOps, data analysis, or general questions.
            </Typography>
          </Box>
        )}

        {messages.map((message) => (
          <Box
            key={message.id}
            sx={{
              display: "flex",
              justifyContent:
                message.role === "user" ? "flex-end" : "flex-start",
              mb: 1,
            }}
          >
            <Box
              sx={{
                display: "flex",
                flexDirection: message.role === "user" ? "row-reverse" : "row",
                alignItems: "flex-start",
                gap: 1,
                maxWidth: "80%",
              }}
            >
              <Avatar
                sx={{
                  width: 32,
                  height: 32,
                  bgcolor:
                    message.role === "user" ? "primary.main" : "secondary.main",
                }}
              >
                {message.role === "user" ? <Person /> : <SmartToy />}
              </Avatar>
              <Paper
                elevation={1}
                sx={{
                  p: 2,
                  color: "text.primary",
                }}
              >
                <Typography variant="body1" sx={{ whiteSpace: "pre-wrap" }}>
                  {message.content}
                </Typography>

                {/* Display attached context */}
                {message.attachedContext &&
                  message.attachedContext.length > 0 && (
                    <Box sx={{ mt: 2 }}>
                      <Accordion elevation={0} sx={{ bgcolor: "transparent" }}>
                        <AccordionSummary
                          expandIcon={<ExpandMore />}
                          sx={{
                            minHeight: 32,
                            "& .MuiAccordionSummary-content": {
                              margin: "8px 0",
                            },
                          }}
                        >
                          <Typography
                            variant="caption"
                            sx={{ fontWeight: 500 }}
                          >
                            {message.attachedContext.length} attached context
                            item{message.attachedContext.length > 1 ? "s" : ""}
                          </Typography>
                        </AccordionSummary>
                        <AccordionDetails sx={{ pt: 0 }}>
                          {message.attachedContext.map((context, index) => (
                            <Box
                              key={context.id}
                              sx={{
                                mb:
                                  index < message.attachedContext!.length - 1
                                    ? 2
                                    : 0,
                              }}
                            >
                              <Box
                                sx={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 1,
                                  mb: 1,
                                }}
                              >
                                {context.type === "collection" && (
                                  <Storage fontSize="small" />
                                )}
                                {context.type === "definition" && (
                                  <Code fontSize="small" />
                                )}
                                {context.type === "editor" && (
                                  <Description fontSize="small" />
                                )}
                                {context.type === "view" && (
                                  <TableView fontSize="small" />
                                )}
                                <Typography
                                  variant="caption"
                                  sx={{ fontWeight: 500 }}
                                >
                                  {context.title}
                                </Typography>
                                {context.metadata?.fileName && (
                                  <Chip
                                    label={context.metadata.fileName}
                                    size="small"
                                    variant="outlined"
                                    sx={{ height: 16, fontSize: "0.65rem" }}
                                  />
                                )}
                              </Box>
                              <Paper
                                variant="outlined"
                                sx={{
                                  p: 1,
                                  bgcolor: "grey.50",
                                  maxHeight: 150,
                                  overflow: "auto",
                                }}
                              >
                                <Typography
                                  variant="caption"
                                  component="pre"
                                  sx={{
                                    whiteSpace: "pre-wrap",
                                    fontFamily: "monospace",
                                    fontSize: "0.75rem",
                                  }}
                                >
                                  {context.content}
                                </Typography>
                              </Paper>
                            </Box>
                          ))}
                        </AccordionDetails>
                      </Accordion>
                    </Box>
                  )}

                <Typography
                  variant="caption"
                  sx={{
                    display: "block",
                    mt: 1,
                    opacity: 0.7,
                  }}
                >
                  {message.timestamp.toLocaleTimeString()}
                </Typography>
              </Paper>
            </Box>
          </Box>
        ))}

        {isLoading && (
          <Box sx={{ display: "flex", justifyContent: "flex-start", mb: 1 }}>
            <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
              <Avatar sx={{ width: 32, height: 32, bgcolor: "secondary.main" }}>
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
      </Box>

      {/* Error Display */}
      {error && (
        <Box sx={{ p: 2 }}>
          <Alert severity="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        </Box>
      )}

      {/* Input Area */}
      <Box
        sx={{
          p: 2,
          borderTop: 1,
          borderColor: "divider",
        }}
      >
        {/* Attached Context Display */}
        {attachedContext.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography
              variant="caption"
              sx={{ fontWeight: 500, mb: 1, display: "block" }}
            >
              Attached Context ({attachedContext.length}):
            </Typography>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
              {attachedContext.map((context) => (
                <Chip
                  key={context.id}
                  label={context.title}
                  size="small"
                  icon={
                    context.type === "collection" ? (
                      <Storage />
                    ) : context.type === "definition" ? (
                      <Code />
                    ) : context.type === "view" ? (
                      <TableView />
                    ) : (
                      <Description />
                    )
                  }
                  onDelete={() => removeContextItem(context.id)}
                  deleteIcon={<Close />}
                  variant="outlined"
                  sx={{ maxWidth: 200 }}
                />
              ))}
            </Box>
          </Box>
        )}

        {/* Input Row */}
        <Box sx={{ display: "flex", gap: 1 }}>
          <IconButton
            onClick={handleContextMenuOpen}
            disabled={isLoading}
            sx={{ alignSelf: "flex-end" }}
          >
            <AttachFile />
          </IconButton>
          <TextField
            fullWidth
            multiline
            maxRows={4}
            placeholder="Ask me anything..."
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={isLoading}
            variant="outlined"
            size="small"
          />
          <Button
            variant="contained"
            onClick={sendMessage}
            disabled={!inputMessage.trim() || isLoading}
            sx={{ minWidth: 48, alignSelf: "flex-end" }}
          >
            <SendIcon />
          </Button>
        </Box>

        {/* Context Menu */}
        <Menu
          anchorEl={contextMenuAnchor}
          open={Boolean(contextMenuAnchor)}
          onClose={handleContextMenuClose}
        >
          <MenuItem onClick={() => setCollectionsDialogOpen(true)}>
            <ListItemIcon>
              <Storage fontSize="small" />
            </ListItemIcon>
            <ListItemText primary="Add Collection" />
          </MenuItem>
          <MenuItem onClick={() => setDefinitionsDialogOpen(true)}>
            <ListItemIcon>
              <Code fontSize="small" />
            </ListItemIcon>
            <ListItemText primary="Add Definition" />
          </MenuItem>
          <MenuItem onClick={() => setViewsDialogOpen(true)}>
            <ListItemIcon>
              <TableView fontSize="small" />
            </ListItemIcon>
            <ListItemText primary="Add View" />
          </MenuItem>
          <MenuItem onClick={addEditorContext}>
            <ListItemIcon>
              <Description fontSize="small" />
            </ListItemIcon>
            <ListItemText primary="Add Editor Content" />
          </MenuItem>
        </Menu>
      </Box>

      {/* Collections Dialog */}
      <Dialog
        open={collectionsDialogOpen}
        onClose={() => setCollectionsDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Select Collection to Attach</DialogTitle>
        <DialogContent>
          <List>
            {availableCollections.map((collection) => (
              <ListItem key={collection.id} divider>
                <ListItemIcon>
                  <Storage />
                </ListItemIcon>
                <ListItemText
                  primary={collection.name}
                  secondary={
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        {collection.description}
                      </Typography>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ mt: 0.5 }}
                      >
                        {collection.documentCount.toLocaleString()} documents
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{ mt: 1, display: "block" }}
                      >
                        Sample Document:
                      </Typography>
                      <Paper
                        variant="outlined"
                        sx={{
                          p: 1,
                          mt: 0.5,
                          bgcolor: "grey.50",
                          maxHeight: 100,
                          overflow: "auto",
                        }}
                      >
                        <Typography
                          variant="caption"
                          component="pre"
                          sx={{
                            fontFamily: "monospace",
                            fontSize: "0.7rem",
                          }}
                        >
                          {JSON.stringify(collection.sampleDocument, null, 2)}
                        </Typography>
                      </Paper>
                    </Box>
                  }
                />
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => addCollectionContext(collection)}
                >
                  Attach
                </Button>
              </ListItem>
            ))}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCollectionsDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Definitions Dialog */}
      <Dialog
        open={definitionsDialogOpen}
        onClose={() => setDefinitionsDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Select Definition to Attach</DialogTitle>
        <DialogContent>
          <List>
            {availableDefinitions.map((definition) => (
              <ListItem key={definition.id} divider>
                <ListItemIcon>
                  <Code />
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <Typography variant="subtitle2">
                        {definition.name}
                      </Typography>
                      <Chip
                        label={definition.type}
                        size="small"
                        variant="outlined"
                        sx={{ height: 20, fontSize: "0.7rem" }}
                      />
                      <Chip
                        label={`${definition.fileName}:${definition.lineNumbers}`}
                        size="small"
                        variant="outlined"
                        sx={{ height: 20, fontSize: "0.7rem" }}
                      />
                    </Box>
                  }
                  secondary={
                    <Paper
                      variant="outlined"
                      sx={{
                        p: 1,
                        mt: 1,
                        bgcolor: "grey.50",
                        maxHeight: 100,
                        overflow: "auto",
                      }}
                    >
                      <Typography
                        variant="caption"
                        component="pre"
                        sx={{
                          fontFamily: "monospace",
                          fontSize: "0.75rem",
                        }}
                      >
                        {definition.content}
                      </Typography>
                    </Paper>
                  }
                />
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => addDefinitionContext(definition)}
                >
                  Attach
                </Button>
              </ListItem>
            ))}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDefinitionsDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Views Dialog */}
      <Dialog
        open={viewsDialogOpen}
        onClose={() => setViewsDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Select View to Attach</DialogTitle>
        <DialogContent>
          <List>
            {availableViews.map((view) => (
              <ListItem key={view.id} divider>
                <ListItemIcon>
                  <TableView />
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <Typography variant="subtitle2">{view.name}</Typography>
                      <Chip
                        label={`View on ${view.viewOn}`}
                        size="small"
                        variant="outlined"
                        sx={{ height: 20, fontSize: "0.7rem" }}
                      />
                    </Box>
                  }
                  secondary={
                    <Box>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ mb: 1 }}
                      >
                        {view.description}
                      </Typography>
                      <Paper
                        variant="outlined"
                        sx={{
                          p: 1,
                          bgcolor: "grey.50",
                          maxHeight: 150,
                          overflow: "auto",
                        }}
                      >
                        <Typography
                          variant="caption"
                          component="pre"
                          sx={{
                            fontFamily: "monospace",
                            fontSize: "0.75rem",
                          }}
                        >
                          {JSON.stringify(view.pipeline, null, 2)}
                        </Typography>
                      </Paper>
                    </Box>
                  }
                />
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => addViewContext(view)}
                >
                  Attach
                </Button>
              </ListItem>
            ))}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setViewsDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ChatBot;
