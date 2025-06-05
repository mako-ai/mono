import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { consoleRoutes } from "./routes/consoles";
import { executeRoutes } from "./routes/execute";
import { databaseRoutes } from "./routes/database";
import { dataSourceRoutes } from "./routes/sources";
import { databasesRoutes } from "./routes/databases";
import { customPromptRoutes } from "./routes/custom-prompt";
import { aiRoutes } from "./routes/ai";
import { chatsRoutes } from "./routes/chats";
import { agentRoutes } from "./routes/agent";

// Resolve the root‐level .env file regardless of the runtime working directory
const envPath = path.resolve(__dirname, "../../.env");

if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
  console.log(`✅ Loaded environment variables from ${envPath}`);
} else {
  console.warn(
    `⚠️  .env file was not found at ${envPath}. Environment variables must be set another way.`
  );
}

const app = new Hono();

// CORS middleware
app.use(
  "*",
  cors({
    origin: ["http://localhost:5173", "http://localhost:3000"], // Vite dev server and potential production
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

// Health check
app.get("/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

// API routes
app.route("/api/consoles", consoleRoutes);
app.route("/api/run", executeRoutes);
app.route("/api/execute", executeRoutes);
app.route("/api/database", databaseRoutes);
app.route("/api/sources", dataSourceRoutes);
app.route("/api/databases", databasesRoutes);
app.route("/api/custom-prompt", customPromptRoutes);
app.route("/api/ai", aiRoutes);
app.route("/api/chats", chatsRoutes);
app.route("/api/agent", agentRoutes);

const port = parseInt(process.env.WEB_API_PORT || "3001");

console.log(`🚀 Query API Server starting on port ${port}`);
console.log(`📁 Environment: ${process.env.NODE_ENV || "development"}`);
console.log(`🔗 API endpoints available at /api/*`);

serve({
  fetch: app.fetch,
  port,
});
