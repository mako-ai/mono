import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  TextField,
  IconButton,
  Paper,
  List,
  ListItem,
  ListItemText,
  LinearProgress,
  Chip,
  Typography,
  FormControl,
  Select,
  MenuItem,
  InputLabel,
  Button,
  Menu,
  ListItemIcon,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import BuildIcon from '@mui/icons-material/BuildOutlined';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { tomorrow } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { prism } from 'react-syntax-highlighter/dist/esm/styles/prism';
import {
  ExpandMore,
  ExpandLess,
  ContentCopy,
  Check,
  History as HistoryIcon,
  Add as AddIcon,
  Chat as ChatIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { useTheme as useMuiTheme } from '@mui/material/styles';
import { useWorkspace } from '../contexts/workspace-context';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ToolStatus {
  isExecuting: boolean;
  toolName?: string;
  message?: string;
}

interface ChatSessionMeta {
  _id: string;
  title: string;
  createdAt?: string;
  updatedAt?: string;
}

const Chat2: React.FC = () => {
  const { currentWorkspace } = useWorkspace();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [toolStatus, setToolStatus] = useState<ToolStatus>({
    isExecuting: false,
  });

  const [sessions, setSessions] = useState<ChatSessionMeta[]>([]);
  const [sessionId, setSessionId] = useState<string | ''>('');

  // Fetch sessions list on mount
  useEffect(() => {
    const fetchSessions = async () => {
      if (!currentWorkspace) return;

      try {
        const res = await fetch(`/api/workspaces/${currentWorkspace.id}/chats`);
        if (res.ok) {
          const data = await res.json();
          setSessions(data);
          // Auto-select first session if exists
          if (data.length > 0 && !sessionId) {
            setSessionId(data[0]._id);
          }
        }
      } catch (_) {
        // ignore
      }
    };
    fetchSessions();
  }, [currentWorkspace]);

  // Load messages when sessionId changes
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

  const createNewSession = async () => {
    if (!currentWorkspace) return;

    try {
      const res = await fetch(`/api/workspaces/${currentWorkspace.id}/chats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New Chat' }),
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
    } catch (_) {}
  };

  const streamResponse = async (latestMessage: string) => {
    const response = await fetch('/api/ai/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, message: latestMessage }),
    });

    if (!response.ok || !response.body) {
      throw new Error(`HTTP ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let assistantContent = '';
    let done = false;

    // optimistically append empty assistant message
    setMessages(
      (prev) =>
        [...prev, { role: 'assistant', content: '' } as Message] as Message[],
    );

    while (!done) {
      const { value, done: doneReading } = await reader.read();
      done = doneReading;
      const chunkValue = decoder.decode(value || new Uint8Array());

      const lines = chunkValue.split('\n\n').filter(Boolean);
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.replace('data: ', '');
          if (data === '[DONE]') {
            done = true;
            setToolStatus({ isExecuting: false });
            break;
          }
          try {
            const parsed = JSON.parse(data);

            // Handle different event types
            switch (parsed.type) {
              case 'text':
                assistantContent += parsed.content;
                setMessages((prev) => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last && last.role === 'assistant') {
                    updated[updated.length - 1] = {
                      ...last,
                      content: assistantContent,
                    };
                  }
                  return updated;
                });
                break;

              case 'tool_call':
                setToolStatus({ isExecuting: true, message: parsed.message });
                break;

              case 'tool_execution':
                setToolStatus({
                  isExecuting: true,
                  toolName: parsed.tool,
                  message: `Executing ${parsed.tool}...`,
                });
                break;

              case 'tool_complete':
                setToolStatus({
                  isExecuting: true,
                  message: parsed.message,
                });
                break;

              default:
                // For backward compatibility, treat as text if no type
                if (typeof parsed === 'string') {
                  assistantContent += parsed;
                  setMessages((prev) => {
                    const updated = [...prev];
                    const last = updated[updated.length - 1];
                    if (last && last.role === 'assistant') {
                      updated[updated.length - 1] = {
                        ...last,
                        content: assistantContent,
                      };
                    }
                    return updated;
                  });
                }
            }
          } catch (_) {
            /* ignore parse errors */
          }
        }
      }
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || !currentWorkspace) return;

    const userMessage = input.trim();
    const newMessages: Message[] = [
      ...messages,
      { role: 'user', content: userMessage } as Message,
    ];
    setMessages(newMessages);
    setInput('');
    setLoading(true);
    setToolStatus({ isExecuting: false });

    try {
      await streamResponse(userMessage);
    } catch (err: any) {
      setMessages([
        ...newMessages,
        {
          role: 'assistant',
          content: `Error: ${err.message}`,
        } as Message,
      ] as Message[]);
    } finally {
      setLoading(false);
      setToolStatus({ isExecuting: false });
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ p: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
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

      <Paper sx={{ flex: 1, overflow: 'auto', p: 1 }}>
        <List dense>
          {messages.map((m, idx) => (
            <ListItem key={idx}>
              <ListItemText
                primary={m.content}
                primaryTypographyProps={{
                  variant: 'body2',
                  color: m.role === 'user' ? 'text.primary' : 'text.secondary',
                  sx: { whiteSpace: 'pre-wrap' },
                }}
              />
            </ListItem>
          ))}
          {loading && (
            <ListItem>
              <Box sx={{ width: '100%' }}>
                {toolStatus.isExecuting ? (
                  <Box
                    sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <BuildIcon color="primary" fontSize="small" />
                      <Typography variant="body2" color="text.secondary">
                        {toolStatus.message || 'Processing...'}
                      </Typography>
                    </Box>
                    {toolStatus.toolName && (
                      <Chip
                        label={toolStatus.toolName}
                        size="small"
                        color="primary"
                        variant="outlined"
                      />
                    )}
                    <LinearProgress />
                  </Box>
                ) : (
                  <ListItemText
                    primary="Assistant is typing…"
                    primaryTypographyProps={{
                      variant: 'body2',
                      color: 'text.disabled',
                    }}
                  />
                )}
              </Box>
            </ListItem>
          )}
        </List>
      </Paper>
      <Box sx={{ display: 'flex', p: 1, gap: 1 }}>
        <TextField
          variant="outlined"
          placeholder="Ask Chat2…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
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
          disabled={loading || !input.trim() || !sessionId || !currentWorkspace}
        >
          <SendIcon />
        </IconButton>
      </Box>
    </Box>
  );
};

export default Chat2;
