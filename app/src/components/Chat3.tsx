import React, { useEffect, useState, useRef } from "react";
import {
  Box,
  Button,
  Chip,
  IconButton,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Paper,
  TextField,
  Typography,
  Menu,
  ListItemIcon,
} from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import BuildIcon from "@mui/icons-material/BuildOutlined";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import {
  prism,
  tomorrow,
} from "react-syntax-highlighter/dist/esm/styles/prism";
import {
  ExpandMore,
  ExpandLess,
  ContentCopy,
  Check,
  History as HistoryIcon,
  Add as AddIcon,
  Chat as ChatIcon,
  Delete as DeleteIcon,
} from "@mui/icons-material";
import { useTheme as useMuiTheme } from "@mui/material/styles";
import { useWorkspace } from "../contexts/workspace-context";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ChatSessionMeta {
  _id: string;
  title: string;
  createdAt?: string;
  updatedAt?: string;
}

const CodeBlock = React.memo(
  ({
    language,
    children,
    isGenerating,
  }: {
    language: string;
    children: string;
    isGenerating: boolean;
  }) => {
    const muiTheme = useMuiTheme();
    const effectiveMode = muiTheme.palette.mode;
    const syntaxTheme = effectiveMode === "dark" ? tomorrow : prism;
    const [isExpanded, setIsExpanded] = React.useState(false);
    const [isCopied, setIsCopied] = React.useState(false);

    // Split code into lines
    const lines = children.split("\n");
    const needsExpansion = lines.length > 12;

    // Show only first 12 lines if not expanded
    const displayedCode =
      needsExpansion && !isExpanded ? lines.slice(0, 12).join("\n") : children;

    const handleCopy = async () => {
      try {
        await navigator.clipboard.writeText(children);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      } catch (err) {
        console.error("Failed to copy code:", err);
      }
    };

    return (
      <Box
        sx={{
          overflow: "hidden",
          borderRadius: 1,
          my: 1,
          position: "relative",
        }}
      >
        {isGenerating && (
          <Box
            sx={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 1,
            }}
          >
            <Typography variant="body2" color="text.primary">
              Generating...
            </Typography>
          </Box>
        )}
        {/* Copy button */}
        <Box
          sx={{
            position: "absolute",
            top: 8,
            right: 8,
            zIndex: 1,
          }}
        >
          <IconButton
            size="small"
            onClick={handleCopy}
            sx={{
              backgroundColor:
                effectiveMode === "dark"
                  ? "rgba(255,255,255,0.1)"
                  : "rgba(0,0,0,0.1)",
              "&:hover": {
                backgroundColor:
                  effectiveMode === "dark"
                    ? "rgba(255,255,255,0.2)"
                    : "rgba(0,0,0,0.2)",
              },
              transition: "all 0.2s",
            }}
          >
            {isCopied ? (
              <Check sx={{ fontSize: 16, color: "success.main" }} />
            ) : (
              <ContentCopy sx={{ fontSize: 16 }} />
            )}
          </IconButton>
        </Box>

        <SyntaxHighlighter
          style={syntaxTheme as any}
          language={language}
          PreTag="div"
          customStyle={{
            fontSize: "0.8rem",
            margin: 0,
            overflow: "auto",
            maxWidth: "100%",
            paddingBottom: needsExpansion ? "2rem" : undefined,
            paddingTop: "2rem", // Add padding to prevent copy button overlap
          }}
        >
          {displayedCode}
        </SyntaxHighlighter>

        {needsExpansion && (
          <Box
            sx={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              display: "flex",
              justifyContent: "center",
            }}
          >
            <Button
              size="small"
              onClick={() => setIsExpanded(!isExpanded)}
              sx={{
                borderRadius: 0,
                flexGrow: 1,
                color: "text.primary",
                backgroundColor:
                  effectiveMode === "dark"
                    ? "rgba(0, 0, 0, 0.3)"
                    : "rgba(255, 255, 255, 0.3)",
                "&:hover": {
                  backgroundColor:
                    effectiveMode === "dark"
                      ? "rgba(0, 0, 0, 0.1)"
                      : "rgba(255, 255, 255, 0.1)",
                },
              }}
            >
              {isExpanded ? <ExpandLess /> : <ExpandMore />}
            </Button>
          </Box>
        )}
      </Box>
    );
  },
);

CodeBlock.displayName = "CodeBlock";

// Rewrite MessageItem component
const MessageItem = React.memo(
  ({
    message,
    isLastUser,
    loading,
  }: {
    message: Message;
    isLastUser: boolean;
    loading: boolean;
  }) => {
    const muiTheme = useMuiTheme();

    // Memoize markdown rendering to keep CodeBlock stable
    const markdownContent = React.useMemo(() => {
      return (
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            code({ className, children }) {
              const match = /language-(\w+)/.exec(className || "");
              const isInline = !match;
              const codeString = String(children).replace(/\n$/, "");
              return !isInline ? (
                <CodeBlock
                  language={match![1]}
                  key={codeString}
                  isGenerating={false}
                >
                  {codeString}
                </CodeBlock>
              ) : (
                <code className={className} style={{ fontSize: "0.8rem" }}>
                  {children}
                </code>
              );
            },
            table({ children }) {
              return (
                <Box sx={{ overflow: "auto", my: 1 }}>
                  <table
                    style={{
                      borderCollapse: "collapse",
                      width: "100%",
                      fontSize: "0.875rem",
                      border: `1px solid ${muiTheme.palette.divider}`,
                    }}
                  >
                    {children}
                  </table>
                </Box>
              );
            },
            th({ children }) {
              return (
                <th
                  style={{
                    padding: "8px 12px",
                    textAlign: "left",
                    backgroundColor: muiTheme.palette.background.paper,
                    borderBottom: `2px solid ${muiTheme.palette.divider}`,
                    borderRight: `1px solid ${muiTheme.palette.divider}`,
                    fontWeight: 600,
                  }}
                >
                  {children}
                </th>
              );
            },
            td({ children }) {
              return (
                <td
                  style={{
                    padding: "8px 12px",
                    borderBottom: `1px solid ${muiTheme.palette.divider}`,
                    borderRight: `1px solid ${muiTheme.palette.divider}`,
                    backgroundColor: muiTheme.palette.background.paper,
                  }}
                >
                  {children}
                </td>
              );
            },
          }}
        >
          {message.content}
        </ReactMarkdown>
      );
    }, [
      message.content,
      muiTheme.palette.divider,
      muiTheme.palette.background.paper,
    ]);

    return (
      <ListItem alignItems="flex-start" sx={{ p: 0 }}>
        {message.role === "user" ? (
          <Box sx={{ flex: 1 }}>
            <Paper
              variant="outlined"
              sx={{
                p: 1,
                borderRadius: 1,
                backgroundColor: "background.paper",
                overflow: "hidden",
              }}
            >
              <Box
                sx={{
                  overflow: "auto",
                  maxWidth: "100%",
                }}
              >
                <ListItemText
                  primary={message.content}
                  primaryTypographyProps={{
                    variant: "body2",
                    color: "text.primary",
                    sx: {
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      overflowWrap: "break-word",
                    },
                  }}
                />
              </Box>
              {/* Generating notice inside last user message */}
              {isLastUser && loading && (
                <Typography
                  variant="body2"
                  sx={{ color: "text.secondary", mt: 0.5 }}
                >
                  Generating...
                </Typography>
              )}
            </Paper>
          </Box>
        ) : (
          <Box
            sx={{
              flex: 1,
              overflow: "hidden",
              fontSize: "0.875rem",

              "& pre": { margin: 0, overflow: "hidden" },
            }}
          >
            {markdownContent}
          </Box>
        )}
      </ListItem>
    );
  },
);

MessageItem.displayName = "MessageItem";

interface Chat3Props {
  onConsoleModification?: (modification: any) => void;
}

const Chat3: React.FC<Chat3Props> = ({ onConsoleModification }) => {
  const { currentWorkspace } = useWorkspace();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState<ChatSessionMeta[]>([]);
  const [sessionId, setSessionId] = useState<string | "">("");
  const [steps, setSteps] = useState<string[]>([]);
  const [streamingContent, setStreamingContent] = useState<string>("");

  // History menu state
  const [historyMenuAnchor, setHistoryMenuAnchor] =
    useState<null | HTMLElement>(null);
  const historyMenuOpen = Boolean(historyMenuAnchor);

  // Ref for auto-focusing the input
  const inputRef = useRef<HTMLInputElement>(null);

  // ---------------------------------------------------------------------------
  // Session management (identical to Chat2)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const fetchSessions = async () => {
      if (!currentWorkspace) return;

      try {
        const res = await fetch(`/api/workspaces/${currentWorkspace.id}/chats`);
        if (res.ok) {
          const data = await res.json();
          setSessions(data);
          if (data.length > 0 && !sessionId) {
            setSessionId(data[0]._id);
          }
        }
      } catch (_) {
        /* ignore */
      }
    };
    fetchSessions();
  }, [currentWorkspace]);

  useEffect(() => {
    const loadSession = async () => {
      if (!sessionId || !currentWorkspace) {
        setMessages([]);
        return;
      }
      try {
        const res = await fetch(
          `/api/workspaces/${currentWorkspace.id}/chats/${sessionId}`,
        );
        if (res.ok) {
          const data = await res.json();
          setMessages(data.messages || []);
        }
      } catch (_) {
        /* ignore */
      }
    };
    loadSession();
  }, [sessionId, currentWorkspace]);

  // Auto-focus input when session changes or when creating new chat
  useEffect(() => {
    // Focus after a short delay to ensure the component is rendered
    const timer = setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [sessionId, messages.length]);

  const createNewSession = async () => {
    if (!currentWorkspace) return;

    try {
      const res = await fetch(`/api/workspaces/${currentWorkspace.id}/chats`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "New Chat" }),
      });
      if (res.ok) {
        const data = await res.json();
        const newId = data.chatId as string;
        // Refresh sessions list
        const sessionsRes = await fetch(
          `/api/workspaces/${currentWorkspace.id}/chats`,
        );
        if (sessionsRes.ok) {
          const sessionsData = await sessionsRes.json();
          setSessions(sessionsData);
        }
        setSessionId(newId);
        setMessages([]);
      }
    } catch (_) {
      /* ignore */
    }
  };

  // History menu handlers
  const handleHistoryMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setHistoryMenuAnchor(event.currentTarget);
  };

  const handleHistoryMenuClose = () => {
    setHistoryMenuAnchor(null);
  };

  const handleSelectSession = (sessionId: string) => {
    setSessionId(sessionId);
    handleHistoryMenuClose();
  };

  const handleDeleteSession = async (
    sessionIdToDelete: string,
    event: React.MouseEvent,
  ) => {
    event.stopPropagation();
    if (!currentWorkspace) return;

    try {
      const res = await fetch(
        `/api/workspaces/${currentWorkspace.id}/chats/${sessionIdToDelete}`,
        {
          method: "DELETE",
        },
      );
      if (res.ok) {
        // Refresh sessions list
        const sessionsRes = await fetch(
          `/api/workspaces/${currentWorkspace.id}/chats`,
        );
        if (sessionsRes.ok) {
          const sessionsData = await sessionsRes.json();
          setSessions(sessionsData);
          // If we deleted the current session, switch to another one or create new
          if (sessionIdToDelete === sessionId) {
            if (sessionsData.length > 0) {
              setSessionId(sessionsData[0]._id);
            } else {
              createNewSession();
            }
          }
        }
      }
    } catch (_) {
      /* ignore */
    }
  };

  // ---------------------------------------------------------------------------
  // Messaging helpers
  // ---------------------------------------------------------------------------

  const streamResponse = async (latestMessage: string) => {
    if (!currentWorkspace) {
      throw new Error("No workspace selected");
    }

    const response = await fetch("/api/agent/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        message: latestMessage,
        workspaceId: currentWorkspace.id,
      }),
    });

    if (!response.ok || !response.body) {
      throw new Error(`HTTP ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let assistantContent = "";
    let done = false;

    // Don't add optimistic message while loading, handle streaming separately
    setStreamingContent("");

    while (!done) {
      const { value, done: doneReading } = await reader.read();
      done = doneReading;
      const chunkValue = decoder.decode(value || new Uint8Array());

      const lines = chunkValue.split("\n\n").filter(Boolean);
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.replace("data: ", "");
          if (data === "[DONE]") {
            done = true;
            break;
          }

          try {
            const parsed = JSON.parse(data);

            // Handle different event types
            if (parsed.type === "text") {
              assistantContent += parsed.content;
              setStreamingContent(assistantContent);
            } else if (parsed.type === "step" && parsed.name) {
              setSteps(prev => [...prev, parsed.name]);
            } else if (
              parsed.type === "session" &&
              parsed.sessionId &&
              !sessionId
            ) {
              setSessionId(parsed.sessionId);
            } else if (parsed.type === "console_modification" && parsed.modification) {
              // Handle console modification event
              if (onConsoleModification) {
                onConsoleModification(parsed.modification);
              }
            }
          } catch (_) {
            /* ignore */
          }
        }
      }
    }

    // After streaming is complete, add the final message to the messages array
    if (assistantContent) {
      setMessages(prev => [
        ...prev,
        { role: "assistant", content: assistantContent },
      ]);
    }

    setSteps([]);
    setStreamingContent("");
  };

  const sendMessage = async () => {
    if (!input.trim() || !currentWorkspace) return;

    const userMessage = input.trim();

    // Optimistically add user message
    setMessages(prev => [...prev, { role: "user", content: userMessage }]);
    setSteps([]);
    setInput("");
    setLoading(true);

    try {
      await streamResponse(userMessage);
    } catch (err: any) {
      setMessages(prev => [
        ...prev,
        {
          role: "assistant",
          content: `Error: ${err.message}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header with history and new chat */}
      <Box sx={{ px: 1, py: 0.25, borderBottom: 1, borderColor: "divider" }}>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Box
            sx={{
              flexGrow: 1,
              overflow: "hidden",
              maxWidth: "calc(100% - 120px)",
            }}
          >
            <Typography
              variant="h6"
              sx={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              Chat
            </Typography>
          </Box>
          <Box sx={{ display: "flex" }}>
            <IconButton size="small" onClick={createNewSession}>
              <AddIcon />
            </IconButton>
            <IconButton
              size="small"
              onClick={handleHistoryMenuOpen}
              disabled={sessions.length === 0}
            >
              <HistoryIcon />
            </IconButton>
          </Box>
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
        {sessions
          .filter(
            session =>
              session._id === sessionId ||
              (session.title && session.title.length > 0),
          )
          .map(session => (
            <MenuItem
              key={session._id}
              onClick={() => handleSelectSession(session._id)}
              selected={session._id === sessionId}
              sx={{ display: "flex", justifyContent: "space-between" }}
            >
              <Box sx={{ display: "flex", alignItems: "center", flex: 1 }}>
                <ListItemIcon>
                  <ChatIcon fontSize="small" />
                </ListItemIcon>
                <Box>
                  <ListItemText
                    primary={session.title || session._id.substring(0, 8)}
                    secondary={
                      session.updatedAt
                        ? new Date(session.updatedAt).toLocaleString()
                        : session.createdAt
                          ? new Date(session.createdAt).toLocaleString()
                          : ""
                    }
                    primaryTypographyProps={{
                      noWrap: true,
                      sx: { maxWidth: 200 },
                    }}
                  />
                </Box>
              </Box>
              {sessions.length > 1 && (
                <IconButton
                  size="small"
                  onClick={e => handleDeleteSession(session._id, e)}
                  sx={{ ml: 1 }}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              )}
            </MenuItem>
          ))}
        {sessions.length === 0 && (
          <MenuItem disabled>
            <Typography variant="body2" color="text.secondary">
              No chat history yet
            </Typography>
          </MenuItem>
        )}
      </Menu>

      {/* Messages */}
      <Box sx={{ flex: messages.length > 0 ? 1 : 0, overflow: "auto", p: 1 }}>
        <List dense>
          {messages.map((m, idx) => (
            <MessageItem
              key={idx}
              message={m}
              isLastUser={idx === messages.length - 1 && m.role === "user"}
              loading={loading}
            />
          ))}
          {loading && (
            <>
              {/* Show step chips first when loading */}
              <ListItem sx={{ p: 0, mt: 1 }}>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                  {steps.map((s, idx) => (
                    <Chip
                      key={`${s}-${idx}`}
                      icon={<BuildIcon fontSize="small" />}
                      label={s}
                      size="small"
                      variant="outlined"
                      sx={{
                        backgroundColor: "background.paper",
                        borderRadius: 2,
                      }}
                    />
                  ))}
                  {steps.length === 0 && (
                    <Chip label="Assistant is thinking…" size="small" />
                  )}
                </Box>
              </ListItem>
              {/* Show streaming assistant response below the chips */}
              {streamingContent && (
                <ListItem alignItems="flex-start" sx={{ p: 0 }}>
                  <Box
                    sx={{
                      flex: 1,
                      overflow: "hidden",
                      fontSize: "0.875rem",
                      "& pre": {
                        margin: 0,
                        overflow: "hidden",
                      },
                    }}
                  >
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        code({ className, children }) {
                          const match = /language-(\w+)/.exec(className || "");
                          const isInline = !match;
                          const codeString = String(children).replace(
                            /\n$/,
                            "",
                          );
                          return !isInline ? (
                            <CodeBlock
                              language={match![1]}
                              key={codeString}
                              isGenerating
                            >
                              {codeString}
                            </CodeBlock>
                          ) : (
                            <code
                              className={className}
                              style={{ fontSize: "0.8rem" }}
                            >
                              {children}
                            </code>
                          );
                        },
                        table({ children }) {
                          const muiTheme = useMuiTheme();
                          return (
                            <Box sx={{ overflow: "auto", my: 1 }}>
                              <table
                                style={{
                                  borderCollapse: "collapse",
                                  width: "100%",
                                  fontSize: "0.875rem",
                                  border: `1px solid ${muiTheme.palette.divider}`,
                                }}
                              >
                                {children}
                              </table>
                            </Box>
                          );
                        },
                        th({ children }) {
                          const muiTheme = useMuiTheme();
                          return (
                            <th
                              style={{
                                padding: "8px 12px",
                                textAlign: "left",
                                backgroundColor:
                                  muiTheme.palette.background.paper,
                                borderBottom: `2px solid ${muiTheme.palette.divider}`,
                                borderRight: `1px solid ${muiTheme.palette.divider}`,
                                fontWeight: 600,
                              }}
                            >
                              {children}
                            </th>
                          );
                        },
                        td({ children }) {
                          const muiTheme = useMuiTheme();
                          return (
                            <td
                              style={{
                                padding: "8px 12px",
                                borderBottom: `1px solid ${muiTheme.palette.divider}`,
                                borderRight: `1px solid ${muiTheme.palette.divider}`,
                                backgroundColor:
                                  muiTheme.palette.background.paper,
                              }}
                            >
                              {children}
                            </td>
                          );
                        },
                      }}
                    >
                      {streamingContent}
                    </ReactMarkdown>
                  </Box>
                </ListItem>
              )}
            </>
          )}
        </List>
      </Box>

      {/* Input */}
      <Paper
        elevation={0}
        sx={{
          border: 1,
          borderColor: "divider",
          borderRadius: 2.5,
          p: 1,
          m: 1,
          display: "flex",
          flexDirection: "column",
          gap: 1,
        }}
      >
        {/* Text Area */}
        <TextField
          fullWidth
          autoFocus
          multiline
          minRows={1}
          maxRows={6}
          placeholder="Ask Chat3..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          }}
          disabled={loading}
          variant="outlined"
          inputRef={inputRef}
          sx={{
            mb: 0.5,
            maxHeight: "50vh",
            overflowY: "auto",
            "& .MuiInputBase-input": {
              fontSize: 14,
            },
            "& .MuiInputBase-root": {
              p: 0,
              fontSize: 14,
            },
            "& .MuiOutlinedInput-notchedOutline": {
              border: "none",
            },
            "& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline": {
              border: "none",
            },
            "& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline":
              {
                border: "none",
              },
          }}
        />

        {/* Bottom action bar with Send button on right */}
        <Box
          sx={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
          }}
        >
          {/* Send Button */}
          <IconButton
            onClick={sendMessage}
            disabled={
              loading || !input.trim() || !sessionId || !currentWorkspace
            }
            size="small"
            sx={{
              color:
                input.trim() && currentWorkspace
                  ? "primary.main"
                  : "text.disabled",
              p: 0,
              "&:hover": {
                backgroundColor: "action.hover",
              },
            }}
          >
            <SendIcon sx={{ fontSize: 20 }} />
          </IconButton>
        </Box>
      </Paper>
    </Box>
  );
};

export default Chat3;
