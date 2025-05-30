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
  Add,
  AlternateEmailOutlined,
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
      case "console":
        return <Code />;
      default:
        return <Description />;
    }
  };

  return (
    <Paper
      elevation={0}
      sx={{
        border: 1,
        borderColor: "divider",
        borderRadius: 2.5,
        p: 1,
        display: "flex",
        flexDirection: "column",
        gap: 1,
      }}
    >
      <Box sx={{ display: "flex", flexDirection: "row", gap: 1 }}>
        <Button
          variant="outlined"
          size="small"
          onClick={onAttachClick}
          disabled={isLoading}
          startIcon={<AlternateEmailOutlined />}
          sx={{
            height: 24,
            fontSize: "0.8125rem",
            py: 0,
            px: 1,
            minWidth: "auto",
            "& .MuiButton-startIcon": {
              marginLeft: -0.5,
              marginRight: attachedContext.length === 0 ? 0.5 : -0.5,
            },
            "& .MuiSvgIcon-root": {
              fontSize: 16,
            },
          }}
        >
          {attachedContext.length === 0 && "Add context"}
        </Button>
        {/* Attached Context Display - Now inside Paper */}
        {attachedContext.length > 0 && (
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
                sx={{
                  borderRadius: 1,
                  maxWidth: 200,
                  backgroundColor: "background.paper",
                  "&:hover": {
                    backgroundColor: "action.hover",
                  },
                }}
              />
            ))}
          </Box>
        )}
      </Box>
      {/* Text Area */}
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

      {/* Bottom action bar with Attach button and Send button */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        {/* Send Button */}
        <IconButton
          onClick={onSend}
          disabled={!inputMessage.trim() || isLoading}
          size="small"
          sx={{
            color: inputMessage.trim() ? "primary.main" : "text.disabled",
            "&:hover": {
              backgroundColor: "action.hover",
            },
          }}
        >
          <SendIcon sx={{ fontSize: 20 }} />
        </IconButton>
      </Box>
    </Paper>
  );
};

export default UserInput;
