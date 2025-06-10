import { Hono } from "hono";
import * as fs from "fs";
import * as path from "path";

export const customPromptRoutes = new Hono();

// Path to the custom prompt file (go up one level from api to reach repo root)
const CUSTOM_PROMPT_PATH = path.join(
  process.cwd(),
  "..",
  "config",
  "CustomPrompt.md",
);

// Default content for the custom prompt
const DEFAULT_CUSTOM_PROMPT = `# Custom Prompt Configuration

This is your custom prompt that will be combined with the system prompt to provide additional context about your data and business relationships.

## Business Context
Add information about your business domain, terminology, and key concepts here.

## Data Relationships
Describe important relationships between your collections and how they connect.

## Common Queries
Document frequently requested queries or analysis patterns.

## Custom Instructions
Add any specific instructions for how the AI should interpret your data or respond to certain types of questions.

---

*This prompt is combined with the system prompt to provide context-aware responses. You can edit this file through the Settings page.*`;

// Ensure the config directory exists
const ensureConfigDir = () => {
  const configDir = path.dirname(CUSTOM_PROMPT_PATH);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
};

// Ensure the custom prompt file exists with default content
const ensureCustomPromptFile = () => {
  ensureConfigDir();
  if (!fs.existsSync(CUSTOM_PROMPT_PATH)) {
    fs.writeFileSync(CUSTOM_PROMPT_PATH, DEFAULT_CUSTOM_PROMPT, "utf8");
  }
};

// GET /api/custom-prompt - Get the current custom prompt content
customPromptRoutes.get("/", async c => {
  try {
    ensureCustomPromptFile();

    const content = fs.readFileSync(CUSTOM_PROMPT_PATH, "utf8");

    return c.json({
      success: true,
      content: content,
    });
  } catch (error) {
    console.error("Error reading custom prompt:", error);
    return c.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to read custom prompt",
      },
      500,
    );
  }
});

// PUT /api/custom-prompt - Update the custom prompt content
customPromptRoutes.put("/", async c => {
  try {
    const body = await c.req.json();

    if (!body.content && body.content !== "") {
      return c.json(
        {
          success: false,
          error: "Content is required",
        },
        400,
      );
    }

    ensureConfigDir();

    // Write the new content to the file
    fs.writeFileSync(CUSTOM_PROMPT_PATH, body.content, "utf8");

    return c.json({
      success: true,
      message: "Custom prompt updated successfully",
    });
  } catch (error) {
    console.error("Error updating custom prompt:", error);
    return c.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to update custom prompt",
      },
      500,
    );
  }
});

// POST /api/custom-prompt/reset - Reset custom prompt to default
customPromptRoutes.post("/reset", async c => {
  try {
    ensureConfigDir();

    // Write the default content to the file
    fs.writeFileSync(CUSTOM_PROMPT_PATH, DEFAULT_CUSTOM_PROMPT, "utf8");

    return c.json({
      success: true,
      message: "Custom prompt reset to default",
      content: DEFAULT_CUSTOM_PROMPT,
    });
  } catch (error) {
    console.error("Error resetting custom prompt:", error);
    return c.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to reset custom prompt",
      },
      500,
    );
  }
});
