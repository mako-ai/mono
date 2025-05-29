import React from "react";
import {
  Box,
  Typography,
  Paper,
  Avatar,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
} from "@mui/material";
import {
  SmartToy,
  Person,
  ExpandMore,
  Storage,
  Code,
  Description,
  TableView,
} from "@mui/icons-material";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { tomorrow } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Message } from "./types";

interface MessageListProps {
  messages: Message[];
}

const MessageList: React.FC<MessageListProps> = ({ messages }) => {
  const getContextIcon = (type: string) => {
    switch (type) {
      case "collection":
        return <Storage fontSize="small" />;
      case "definition":
        return <Code fontSize="small" />;
      case "view":
        return <TableView fontSize="small" />;
      default:
        return <Description fontSize="small" />;
    }
  };

  return (
    <Box
      sx={{
        flex: 1,
        overflow: "auto",
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      {messages.map((message) => (
        <Box
          key={message.id}
          sx={{
            display: "flex",
            justifyContent: message.role === "user" ? "flex-end" : "flex-start",
            mb: 1,
          }}
        >
          {message.role === "user" ? (
            // User message - keep in bubble
            <Box
              sx={{
                display: "flex",
                flexDirection: "row-reverse",
                alignItems: "flex-start",
                gap: 1,
              }}
            >
              <Paper elevation={1} sx={{ p: 2, color: "text.primary" }}>
                <Typography
                  variant="body2"
                  sx={{ whiteSpace: "pre-wrap", fontSize: "0.875rem" }}
                >
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
                            item
                            {message.attachedContext.length > 1 ? "s" : ""}
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
                                {getContextIcon(context.type)}
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
                                    sx={{
                                      height: 16,
                                      fontSize: "0.65rem",
                                    }}
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
          ) : (
            // Assistant message - no bubble, direct content with markdown
            <Box sx={{ flex: 1, overflow: "hidden" }}>
              <Box
                sx={{
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
                      return !isInline ? (
                        <Box
                          sx={{
                            overflow: "hidden",
                            borderRadius: 1,
                            my: 1,
                          }}
                        >
                          <SyntaxHighlighter
                            style={tomorrow as any}
                            language={match[1]}
                            PreTag="div"
                            customStyle={{
                              fontSize: "0.8rem",
                              margin: 0,
                              overflow: "auto",
                              maxWidth: "100%",
                            }}
                          >
                            {String(children).replace(/\n$/, "")}
                          </SyntaxHighlighter>
                        </Box>
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
                  {message.content}
                </ReactMarkdown>
              </Box>

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
            </Box>
          )}
        </Box>
      ))}
    </Box>
  );
};

export default MessageList;
