import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { serve as serveInngest } from "inngest/hono";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { consoleRoutes } from "./routes/consoles";
import { executeRoutes } from "./routes/execute";
import { databaseRoutes } from "./routes/database";
import { dataSourceRoutes } from "./routes/sources";
import { customPromptRoutes } from "./routes/custom-prompt";
import { chatsRoutes } from "./routes/chats";
import { agentRoutes } from "./routes/agent";
import { authRoutes } from "./auth/auth.controller";
import { connectDatabase } from "./database/schema";
import { workspaceRoutes } from "./routes/workspaces";
import { workspaceDatabaseRoutes } from "./routes/workspace-databases";
import { connectorRoutes } from "./routes/connectors";
import { syncJobRoutes } from "./routes/sync-jobs";
import { functions, inngest } from "./inngest";
import mongoose from "mongoose";
import { databaseConnectionService } from "./services/database-connection.service";

// Resolve the root‐level .env file regardless of the runtime working directory
const envPath = path.resolve(__dirname, "../../.env");

if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
  console.log(`✅ Loaded environment variables from ${envPath}`);
} else {
  console.warn(
    `⚠️  .env file was not found at ${envPath}. Environment variables must be set another way.`,
  );
}

// Connect to MongoDB
connectDatabase().catch(error => {
  console.error("Failed to connect to database:", error);
  // Re-throw to allow the unhandled rejection handler (or the runtime) to exit appropriately
  throw error;
});

const app = new Hono();

// CORS middleware
app.use(
  "*",
  cors({
    origin: process.env.CLIENT_URL || "*",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

// Health check
app.get("/health", c => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

// API routes
app.route("/api/auth", authRoutes);
app.route("/api/workspaces", workspaceRoutes);
app.route("/api/workspaces/:workspaceId/databases", workspaceDatabaseRoutes);
app.route("/api/workspaces/:workspaceId/consoles", consoleRoutes);
app.route("/api/workspaces/:workspaceId/chats", chatsRoutes);
app.route("/api/workspaces/:workspaceId/custom-prompt", customPromptRoutes);
app.route("/api/workspaces/:workspaceId/sources", dataSourceRoutes);
app.route("/api/workspaces/:workspaceId/sync-jobs", syncJobRoutes);
app.route("/api/run", executeRoutes);
app.route("/api/execute", executeRoutes);
app.route("/api/database", databaseRoutes);
app.route("/api/agent", agentRoutes);
app.route("/api/connectors", connectorRoutes);

// Inngest endpoint
app.on(
  ["GET", "PUT", "POST"],
  "/api/inngest",
  serveInngest({
    client: inngest,
    functions,
  }),
);

// Serve static files (frontend) - middleware for non-API routes
app.use("*", async (c, next) => {
  const requestPath = c.req.path;

  // Skip API routes and health check - let them continue to their handlers
  if (requestPath.startsWith("/api/") || requestPath === "/health") {
    await next();
    return;
  }

  // Try to serve static file
  const publicPath = path.join(process.cwd(), "public");
  const filePath = path.join(publicPath, requestPath);

  // If path doesn't have extension, try adding .html or serve index.html
  if (!path.extname(filePath)) {
    const indexPath = path.join(publicPath, "index.html");
    if (fs.existsSync(indexPath)) {
      const content = fs.readFileSync(indexPath, "utf8");
      return c.html(content);
    }
  }

  // Try to serve the actual file
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    const contentType = getContentType(ext);
    const content = fs.readFileSync(filePath);
    return c.body(content, { headers: { "Content-Type": contentType } });
  }

  // Fallback to index.html for SPA routing
  const indexPath = path.join(publicPath, "index.html");
  if (fs.existsSync(indexPath)) {
    const content = fs.readFileSync(indexPath, "utf8");
    return c.html(content);
  }

  return c.text("Frontend not found", 404);
});

function getContentType(ext: string): string {
  const types: Record<string, string> = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
  };
  return types[ext] || "application/octet-stream";
}

const port = parseInt(process.env.WEB_API_PORT || process.env.PORT || "8080");

console.log(`🚀 Query API Server starting on port ${port}`);
console.log(`📁 Environment: ${process.env.NODE_ENV || "development"}`);
console.log("🔗 API endpoints available at /api/*");
console.log("🔄 Inngest endpoint available at /api/inngest");

serve({
  fetch: app.fetch,
  port,
});

// Graceful shutdown handling
process.on("SIGTERM", () => void gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => void gracefulShutdown("SIGINT"));

async function gracefulShutdown(signal: string): Promise<never> {
  console.log(`\n${signal} received. Starting graceful shutdown...`);

  try {
    // Close unified MongoDB connection pool
    console.log("Closing MongoDB connection pool...");
    await databaseConnectionService.closeAllConnections();
    console.log("MongoDB connection pool closed");

    // Close mongoose connection if open
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
      console.log("Mongoose connection closed");
    }

    console.log("Graceful shutdown complete");
    throw new Error(`Process terminated by ${signal}`);
  } catch (error) {
    console.error("Error during graceful shutdown:", error);
    throw error;
  }
}
