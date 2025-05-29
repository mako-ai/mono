import React from "react";
import { Box, Typography } from "@mui/material";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { tomorrow } from "react-syntax-highlighter/dist/esm/styles/prism";
import { prism } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Message } from "./types";
import { useTheme } from "../../contexts/ThemeContext";
import UserMessage from "./UserMessage";

interface MessageListProps {
  messages: Message[];
}

// Add a memoized code block component
const CodeBlock = React.memo(
  ({ language, children }: { language: string; children: string }) => {
    const { effectiveMode } = useTheme();
    const syntaxTheme = effectiveMode === "dark" ? tomorrow : prism;

    return (
      <Box
        sx={{
          overflow: "hidden",
          borderRadius: 1,
          my: 1,
        }}
      >
        <SyntaxHighlighter
          style={syntaxTheme as any}
          language={language}
          PreTag="div"
          customStyle={{
            fontSize: "0.8rem",
            margin: 0,
            overflow: "auto",
            maxWidth: "100%",
          }}
        >
          {children}
        </SyntaxHighlighter>
      </Box>
    );
  }
);

CodeBlock.displayName = "CodeBlock";

// Add a memoized message component
const MessageItem = React.memo(({ message }: { message: Message }) => {
  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: message.role === "user" ? "flex-end" : "flex-start",
        mb: 0.5,
      }}
    >
      {message.role === "user" ? (
        <UserMessage message={message} />
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
                  const codeString = String(children).replace(/\n$/, "");

                  return !isInline ? (
                    <CodeBlock language={match[1]} key={codeString}>
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
          </Box>
        </Box>
      )}
    </Box>
  );
});

MessageItem.displayName = "MessageItem";

const MessageList: React.FC<MessageListProps> = ({ messages }) => {
  return (
    <Box
      sx={{
        flex: 1,
        overflow: "auto",
        display: "flex",
        flexDirection: "column",
        gap: 1,
      }}
    >
      {messages.map((message) => (
        <MessageItem key={message.id} message={message} />
      ))}
    </Box>
  );
};

export default React.memo(MessageList);
