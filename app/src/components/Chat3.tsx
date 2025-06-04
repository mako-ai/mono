import React, { useEffect, useState } from "react";
import {
  Box,
  Button,
  Chip,
  FormControl,
  IconButton,
  InputLabel,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  TextField,
  Typography,
} from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import BuildIcon from "@mui/icons-material/Build";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { tomorrow } from "react-syntax-highlighter/dist/esm/styles/prism";
import { prism } from "react-syntax-highlighter/dist/esm/styles/prism";
import {
  ExpandMore,
  ExpandLess,
  ContentCopy,
  Check,
} from "@mui/icons-material";
import { useTheme as useMuiTheme } from "@mui/material/styles";

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
  ({ language, children }: { language: string; children: string }) => {
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
              background:
                effectiveMode === "dark"
                  ? "linear-gradient(to bottom, transparent, rgba(0,0,0,0.9))"
                  : "linear-gradient(to bottom, transparent, rgba(255,255,255,0.9))",
              pt: 1,
              pb: 0.5,
            }}
          >
            <IconButton
              size="small"
              onClick={() => setIsExpanded(!isExpanded)}
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
              }}
            >
              {isExpanded ? <ExpandLess /> : <ExpandMore />}
            </IconButton>
          </Box>
        )}
      </Box>
    );
  }
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
    // Memoize markdown rendering to keep CodeBlock stable
    const markdownContent = React.useMemo(() => {
      return (
        <ReactMarkdown
          components={{
            code({ className, children }) {
              const match = /language-(\w+)/.exec(className || "");
              const isInline = !match;
              const codeString = String(children).replace(/\n$/, "");
              return !isInline ? (
                <CodeBlock language={match![1]} key={codeString}>
                  {codeString}
                </CodeBlock>
              ) : (
                <code className={className} style={{ fontSize: "0.8rem" }}>
                  {children}
                </code>
              );
            },
          }}
        >
          {message.content}
        </ReactMarkdown>
      );
    }, [message.content]);

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
              }}
            >
              <ListItemText
                primary={message.content}
                primaryTypographyProps={{
                  variant: "body2",
                  color: "text.primary",
                  sx: { whiteSpace: "pre-wrap" },
                }}
              />
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
              "& p": { fontSize: "0.875rem" },
              "& pre": { margin: 0, overflow: "hidden" },
            }}
          >
            {markdownContent}
          </Box>
        )}
      </ListItem>
    );
  }
);

MessageItem.displayName = "MessageItem";

const Chat3: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState<ChatSessionMeta[]>([]);
  const [sessionId, setSessionId] = useState<string | "">("");
  const [steps, setSteps] = useState<string[]>([]);
  const [streamingContent, setStreamingContent] = useState<string>("");

  // ---------------------------------------------------------------------------
  // Session management (identical to Chat2)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const fetchSessions = async () => {
      try {
        const res = await fetch("/api/chats");
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
  }, []);

  useEffect(() => {
    const loadSession = async () => {
      if (!sessionId) {
        setMessages([]);
        return;
      }
      try {
        const res = await fetch(`/api/chats/${sessionId}`);
        if (res.ok) {
          const data = await res.json();
          setMessages(data.messages || []);
        }
      } catch (_) {
        /* ignore */
      }
    };
    loadSession();
  }, [sessionId]);

  const createNewSession = async () => {
    try {
      const res = await fetch("/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "New Agent Chat" }),
      });
      if (res.ok) {
        const data = await res.json();
        const newId = data.chatId as string;
        // Refresh sessions list
        const sessionsRes = await fetch("/api/chats");
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

  // ---------------------------------------------------------------------------
  // Messaging helpers
  // ---------------------------------------------------------------------------

  const streamResponse = async (latestMessage: string) => {
    const response = await fetch("/api/agent/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, message: latestMessage }),
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

            // Handle different event types (only text and session for now)
            if (parsed.type === "text") {
              assistantContent += parsed.content;
              setStreamingContent(assistantContent);
            } else if (parsed.type === "step" && parsed.name) {
              setSteps((prev) => [...prev, parsed.name]);
            } else if (
              parsed.type === "session" &&
              parsed.sessionId &&
              !sessionId
            ) {
              setSessionId(parsed.sessionId);
            }
          } catch (_) {
            /* ignore */
          }
        }
      }
    }

    // After streaming is complete, add the final message to the messages array
    if (assistantContent) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: assistantContent },
      ]);
    }

    setSteps([]);
    setStreamingContent("");
  };

  const sendMessage = async () => {
    if (!input.trim()) return;

    const userMessage = input.trim();

    // Optimistically add user message
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setSteps([]);
    setInput("");
    setLoading(true);

    try {
      await streamResponse(userMessage);
    } catch (err: any) {
      setMessages((prev) => [
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
      {/* Session selector */}
      <Box sx={{ p: 1, display: "flex", alignItems: "center", gap: 1 }}>
        <FormControl size="small" sx={{ flex: 1 }}>
          <InputLabel id="session-select-label">Session</InputLabel>
          <Select
            labelId="session-select-label"
            value={sessionId}
            label="Session"
            onChange={(e) => setSessionId(e.target.value as string)}
          >
            {sessions.map((s) => (
              <MenuItem key={s._id} value={s._id}>
                {s.title || s._id.substring(0, 6)}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Button variant="outlined" size="small" onClick={createNewSession}>
          New Chat
        </Button>
      </Box>

      {/* Messages */}
      <Box sx={{ flex: 1, overflow: "auto", p: 1 }}>
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
              <ListItem>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                  {steps.map((s, idx) => (
                    <Chip
                      key={`${s}-${idx}`}
                      icon={<BuildIcon fontSize="small" />}
                      label={s}
                      size="small"
                      variant="outlined"
                    />
                  ))}
                  {steps.length === 0 && (
                    <Chip label="Assistant is thinking…" size="small" />
                  )}
                </Box>
              </ListItem>
              {/* Show streaming assistant response below the chips */}
              {streamingContent && (
                <ListItem alignItems="flex-start">
                  <Box
                    sx={{
                      flex: 1,
                      overflow: "hidden",
                      "& p": { fontSize: "0.875rem" },
                      "& pre": {
                        margin: 0,
                        overflow: "hidden",
                      },
                    }}
                  >
                    <ReactMarkdown
                      components={{
                        code({ className, children }) {
                          const match = /language-(\w+)/.exec(className || "");
                          const isInline = !match;
                          const codeString = String(children).replace(
                            /\n$/,
                            ""
                          );
                          return !isInline ? (
                            <CodeBlock language={match![1]} key={codeString}>
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

      {/* Loading indicator below messages, above input */}
      {loading && (
        <Box sx={{ display: "flex", justifyContent: "flex-start", pl: 2 }}>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Generating...
          </Typography>
        </Box>
      )}

      {/* Input */}
      <Box sx={{ display: "flex", p: 1, gap: 1 }}>
        <TextField
          variant="outlined"
          placeholder="Ask Chat3…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          }}
          disabled={loading}
          fullWidth
          size="small"
          multiline
          minRows={1}
          maxRows={6}
        />
        <IconButton
          color="primary"
          onClick={sendMessage}
          disabled={loading || !input.trim() || !sessionId}
        >
          <SendIcon />
        </IconButton>
      </Box>
    </Box>
  );
};

export default Chat3;
