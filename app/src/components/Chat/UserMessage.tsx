import React from "react";
import { Box, Typography, Paper, Chip } from "@mui/material";
import { Storage, Code, Description, TableView } from "@mui/icons-material";
import { Message } from "./types";
import { useAppStore } from "../../store/appStore";
import { useChatStore } from "../../store/chatStore";

interface UserMessageProps {
  message: Message;
}

const UserMessage: React.FC<UserMessageProps> = ({ message }) => {
  // Get loading state from app store and messages from chat store
  const isLoading = useAppStore((s) => s.ui.loading.chatGeneration || false);
  const { getCurrentMessages } = useChatStore();

  // Check if this is the last user message
  const isLastUserMessage = React.useMemo(() => {
    const currentMessages = getCurrentMessages();
    const lastUserMessage = [...currentMessages]
      .reverse()
      .find((msg) => msg.role === "user");
    return lastUserMessage?.id === message.id;
  }, [message.id, getCurrentMessages]);

  const shouldShowGenerating = isLoading && isLastUserMessage;

  const getContextIcon = (type: string) => {
    switch (type) {
      case "collection":
        return <Storage />;
      case "definition":
        return <Code />;
      case "view":
        return <TableView />;
      default:
        return <Description />;
    }
  };

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "row-reverse",
        alignItems: "flex-start",
        gap: 1,
        width: "100%",
        maxWidth: "100%",
      }}
    >
      <Paper
        elevation={0}
        sx={{
          p: 1,
          color: "text.primary",
          width: "100%",
          maxWidth: "100%",
          overflowX: "scroll",
          border: 1,
          borderColor: "divider",
          borderRadius: 2.5,
        }}
      >
        {/* Display attached context as chips above the message */}
        {message.attachedContext && message.attachedContext.length > 0 && (
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: 2 }}>
            {message.attachedContext.map((context) => (
              <Chip
                key={context.id}
                label={context.title}
                size="small"
                icon={getContextIcon(context.type)}
                variant="outlined"
                sx={{
                  borderRadius: 1,
                  maxWidth: 200,
                  backgroundColor: "background.paper",
                  cursor: "default",
                  "&:hover": {
                    backgroundColor: "action.hover",
                  },
                }}
              />
            ))}
          </Box>
        )}

        <Typography
          variant="body2"
          sx={{ whiteSpace: "pre-wrap", fontSize: "0.875rem" }}
        >
          {message.content}
        </Typography>

        {/* Show generating indicator inside the paper when AI is responding */}
        {shouldShowGenerating && (
          <Typography variant="body2" sx={{ color: "text.secondary", mt: 1 }}>
            Generating...
          </Typography>
        )}
      </Paper>
    </Box>
  );
};

export default React.memo(UserMessage);
