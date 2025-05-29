import React from "react";
import {
  Box,
  Typography,
  Paper,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
} from "@mui/material";
import {
  ExpandMore,
  Storage,
  Code,
  Description,
  TableView,
} from "@mui/icons-material";
import { Message } from "./types";

interface UserMessageProps {
  message: Message;
}

const UserMessage: React.FC<UserMessageProps> = ({ message }) => {
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
          p: 2,
          color: "text.primary",
          width: "100%",
          maxWidth: "100%",
          overflowX: "scroll",
        }}
      >
        <Typography
          variant="body2"
          sx={{ whiteSpace: "pre-wrap", fontSize: "0.875rem" }}
        >
          {message.content}
        </Typography>

        {/* Display attached context */}
        {message.attachedContext && message.attachedContext.length > 0 && (
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
                <Typography variant="caption" sx={{ fontWeight: 500 }}>
                  {message.attachedContext.length} attached context item
                  {message.attachedContext.length > 1 ? "s" : ""}
                </Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ pt: 0 }}>
                {message.attachedContext.map((context, index) => (
                  <Box
                    key={context.id}
                    sx={{
                      mb: index < message.attachedContext!.length - 1 ? 2 : 0,
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
                      <Typography variant="caption" sx={{ fontWeight: 500 }}>
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
  );
};

export default React.memo(UserMessage);
