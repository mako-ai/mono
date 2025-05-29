import React from "react";
import {
  Box,
  TextField,
  Button,
  Paper,
  IconButton,
  Typography,
  Chip,
} from "@mui/material";
import {
  Send as SendIcon,
  AttachFile,
  Storage,
  Code,
  Description,
  TableView,
  Close,
} from "@mui/icons-material";
import { AttachedContext } from "./types";

interface UserInputProps {
  inputMessage: string;
  setInputMessage: (message: string) => void;
  attachedContext: AttachedContext[];
  removeContextItem: (id: string) => void;
  onSend: () => void;
  onAttachClick: (event: React.MouseEvent<HTMLElement>) => void;
  isLoading: boolean;
}

const UserInput: React.FC<UserInputProps> = ({
  inputMessage,
  setInputMessage,
  attachedContext,
  removeContextItem,
  onSend,
  onAttachClick,
  isLoading,
}) => {
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const getContextIcon = (type: AttachedContext["type"]) => {
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
    <Box>
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
                icon={getContextIcon(context.type)}
                onDelete={() => removeContextItem(context.id)}
                deleteIcon={<Close />}
                variant="outlined"
                sx={{ maxWidth: 200 }}
              />
            ))}
          </Box>
        </Box>
      )}

      {/* Attach Button above input */}
      <Box sx={{ mb: 1 }}>
        <Button
          variant="outlined"
          size="small"
          startIcon={<AttachFile />}
          onClick={onAttachClick}
          disabled={isLoading}
        >
          Attach Context
        </Button>
      </Box>

      {/* Input Area wrapped in Paper */}
      <Paper
        elevation={0}
        sx={{ border: 1, borderColor: "divider", borderRadius: 2.5 }}
      >
        {/* Text Area - Full width */}
        <TextField
          fullWidth
          autoFocus
          multiline
          minRows={3}
          placeholder="Ask me anything..."
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyPress={handleKeyPress}
          disabled={isLoading}
          variant="outlined"
          sx={{
            mb: 2,
            "& .MuiInputBase-input": {
              fontSize: 14,
            },
            "& .MuiInputBase-root": {
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

        {/* Send Button - Below text area */}
        <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
          <IconButton
            onClick={onSend}
            disabled={!inputMessage.trim() || isLoading}
          >
            <SendIcon sx={{ fontSize: "18px" }} />
          </IconButton>
        </Box>
      </Paper>
    </Box>
  );
};

export default UserInput;
