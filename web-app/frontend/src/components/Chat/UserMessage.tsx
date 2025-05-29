import React from "react";
import { Box, Typography, Paper, Chip } from "@mui/material";
import { Storage, Code, Description, TableView } from "@mui/icons-material";
import { Message } from "./types";

interface UserMessageProps {
  message: Message;
}

const UserMessage: React.FC<UserMessageProps> = ({ message }) => {
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
        elevation={1}
        sx={{
          p: 1.5,
          color: "text.primary",
          width: "100%",
          maxWidth: "100%",
          overflowX: "scroll",
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
      </Paper>
    </Box>
  );
};

export default React.memo(UserMessage);
