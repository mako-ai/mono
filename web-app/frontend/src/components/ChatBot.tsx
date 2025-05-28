import React from "react";
import { Box, Typography } from "@mui/material";

const ChatBot: React.FC = () => {
  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "text.secondary",
      }}
    >
      <Typography>AI Assistant coming soon...</Typography>
    </Box>
  );
};

export default ChatBot;
