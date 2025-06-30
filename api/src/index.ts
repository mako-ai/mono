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
import { customPromptRoutes } from "./routes/custom-prompt";
import { aiRoutes } from "./routes/ai";
import { chatsRoutes } from "./routes/chats";
import { agentRoutes } from "./routes/agent";
import { authRoutes } from "./auth/auth.controller";
import { connectDatabase } from "./database/schema";
import { workspaceRoutes } from "./routes/workspaces";
import { workspaceDatabaseRoutes } from "./routes/workspace-databases";
import { connectorRoutes } from "./routes/connectors";
import { syncJobRoutes } from "./routes/sync-jobs";
import mongoose from "mongoose";

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

// Store worker instance for cleanup
let workerInstance: any = null;
let workerStartAttempts = 0;
let workerHealthCheckInterval: NodeJS.Timeout | null = null;

// Worker supervisor function
async function startWorkerWithSupervision() {
  if (!workerInstance) {
    try {
      const { SyncJobWorker } = await import("./worker");
      workerInstance = new SyncJobWorker();
    } catch (error) {
      console.error("Failed to import worker module:", error);
      return;
    }
  }

  try {
    workerStartAttempts++;
    console.log(`🔄 Starting worker (attempt ${workerStartAttempts})...`);
    await workerInstance.start();
    console.log("✅ Worker started successfully");
    workerStartAttempts = 0; // Reset counter on success
  } catch (error: any) {
    console.error(`❌ Worker start failed: ${error.message}`);

    // Retry with exponential backoff
    const retryDelay = Math.min(
      30000 * Math.pow(2, workerStartAttempts - 1),
      300000,
    ); // Max 5 minutes
    console.log(`⏰ Will retry worker start in ${retryDelay / 1000}s`);

    setTimeout(() => {
      void startWorkerWithSupervision();
    }, retryDelay);
  }
}

// Health check function
function startWorkerHealthCheck() {
  // Check every 2 minutes if worker is alive
  workerHealthCheckInterval = setInterval(() => {
    if (workerInstance && !workerInstance.isRunning) {
      console.log("💀 Worker detected as dead, restarting...");
      workerStartAttempts = 0; // Reset attempts for fresh start
      void startWorkerWithSupervision();
    }
  }, 120000); // 2 minutes
}

// Initialize sync job worker in production or when explicitly enabled
if (
  process.env.NODE_ENV === "production" ||
  process.env.ENABLE_SYNC_WORKER === "true"
) {
  // Start worker with supervision
  void startWorkerWithSupervision();

  // Start health checks after a delay to let worker initialize
  setTimeout(() => {
    startWorkerHealthCheck();
  }, 60000); // Start health checks after 1 minute
}

// Graceful shutdown function
async function gracefulShutdown(signal: string): Promise<void> {
  console.log(`${signal} received, shutting down gracefully...`);

  // Clear health check interval
  if (workerHealthCheckInterval) {
    clearInterval(workerHealthCheckInterval);
  }

  if (workerInstance) {
    try {
      console.log("Stopping sync job worker...");
      await workerInstance.stop();
      console.log("Sync job worker stopped successfully");
    } catch (error) {
      console.error("Error stopping sync job worker:", error);
    }
  }

  // Close database connections
  try {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
      console.log("Database connection closed");
    }
  } catch (error) {
    console.error("Error closing database connection:", error);
  }

  console.log("Graceful shutdown complete");
}

// Handle various shutdown signals and events
process.on("SIGTERM", () => {
  void gracefulShutdown("SIGTERM")
    .then(() => {
      // eslint-disable-next-line no-process-exit
      process.exit(0);
    })
    .catch(error => {
      console.error("Error during shutdown:", error);
      // eslint-disable-next-line no-process-exit
      process.exit(1);
    });
});

process.on("SIGINT", () => {
  void gracefulShutdown("SIGINT")
    .then(() => {
      // eslint-disable-next-line no-process-exit
      process.exit(0);
    })
    .catch(error => {
      console.error("Error during shutdown:", error);
      // eslint-disable-next-line no-process-exit
      process.exit(1);
    });
});

process.on("SIGHUP", () => {
  void gracefulShutdown("SIGHUP")
    .then(() => {
      // eslint-disable-next-line no-process-exit
      process.exit(0);
    })
    .catch(error => {
      console.error("Error during shutdown:", error);
      // eslint-disable-next-line no-process-exit
      process.exit(1);
    });
});

// Handle uncaught exceptions and rejections
process.on("uncaughtException", error => {
  console.error("Uncaught Exception:", error);
  void gracefulShutdown("uncaughtException").finally(() => {
    // eslint-disable-next-line no-process-exit
    process.exit(1);
  });
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  void gracefulShutdown("unhandledRejection").finally(() => {
    // eslint-disable-next-line no-process-exit
    process.exit(1);
  });
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

// Worker health check
app.get("/health/worker", c => {
  const workerStatus = {
    enabled:
      process.env.NODE_ENV === "production" ||
      process.env.ENABLE_SYNC_WORKER === "true",
    running: workerInstance?.isRunning || false,
    startAttempts: workerStartAttempts,
    lastError: workerInstance?.lastError || null,
    timestamp: new Date().toISOString(),
  };

  const httpStatus = workerStatus.enabled && !workerStatus.running ? 503 : 200;
  return c.json(workerStatus, httpStatus);
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
app.route("/api/ai", aiRoutes);
app.route("/api/agent", agentRoutes);
app.route("/api/connectors", connectorRoutes);

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

serve({
  fetch: app.fetch,
  port,
});
