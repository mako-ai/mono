import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import dotenv from "dotenv";
import { consoleRoutes } from "./routes/consoles";
import { executeRoutes } from "./routes/execute";
import { databaseRoutes } from "./routes/database";
import { dataSourceRoutes } from "./routes/sources";
import { databasesRoutes } from "./routes/databases";
import { customPromptRoutes } from "./routes/custom-prompt";

// Load environment variables from the root project
dotenv.config({ path: "../../.env" });

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

const port = parseInt(process.env.WEB_API_PORT || "3001");

console.log(`🚀 Query API Server starting on port ${port}`);
console.log(`📁 Environment: ${process.env.NODE_ENV || "development"}`);
console.log(`🔗 API endpoints available at /api/*`);

serve({
  fetch: app.fetch,
  port,
});
