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
} from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import BuildIcon from "@mui/icons-material/Build";

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
      <Paper sx={{ flex: 1, overflow: "auto", p: 1 }}>
        <List dense>
          {messages.map((m, idx) => (
            <ListItem key={idx}>
              <ListItemText
                primary={m.content}
                primaryTypographyProps={{
                  variant: "body2",
                  color: m.role === "user" ? "text.primary" : "text.secondary",
                  sx: { whiteSpace: "pre-wrap" },
                }}
              />
            </ListItem>
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
                <ListItem>
                  <ListItemText
                    primary={streamingContent}
                    primaryTypographyProps={{
                      variant: "body2",
                      color: "text.secondary",
                      sx: { whiteSpace: "pre-wrap" },
                    }}
                  />
                </ListItem>
              )}
            </>
          )}
        </List>
      </Paper>

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
