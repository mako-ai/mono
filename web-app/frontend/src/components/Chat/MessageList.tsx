import React from "react";
import { Box, Typography } from "@mui/material";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { tomorrow } from "react-syntax-highlighter/dist/esm/styles/prism";
import { prism } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Message } from "./types";
import { useTheme } from "../../contexts/ThemeContext";
import UserMessage from "./UserMessage";
import { ExpandMore, ExpandLess } from "@mui/icons-material";
import { IconButton } from "@mui/material";
import { ContentCopy, Check } from "@mui/icons-material";

interface MessageListProps {
  messages: Message[];
}

// Add a memoized code block component
const CodeBlock = React.memo(
  ({ language, children }: { language: string; children: string }) => {
    const { effectiveMode } = useTheme();
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
        display: "flex",
        flexDirection: "column",
        gap: 1,
        pb: 12,
      }}
    >
      {messages.map((message) => (
        <MessageItem key={message.id} message={message} />
      ))}
    </Box>
  );
};

export default React.memo(MessageList);
