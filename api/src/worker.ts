import * as cron from "node-cron";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";
import { connectDatabase } from "./database/schema";
import { SyncJob } from "./database/workspace-schema";
import { performSync } from "./services/sync-executor.service";
import { Types } from "mongoose";
import * as os from "os";

// Load environment variables
const envPath = path.resolve(__dirname, "../../.env");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

// Job executions collection configuration
const JOB_EXECUTIONS_CONFIG = {
  name: "job_executions",
  ttlDays: 30, // Keep executions for 30 days
};

// Job execution logging interface
interface JobExecutionLog {
  timestamp: Date;
  level: "debug" | "info" | "warn" | "error";
  message: string;
  metadata?: any;
}

interface _JobExecution {
  _id?: Types.ObjectId;
  jobId: Types.ObjectId;
  workspaceId: Types.ObjectId;
  startedAt: Date;
  completedAt?: Date;
  lastHeartbeat?: Date;
  duration?: number;
  status: "running" | "completed" | "failed" | "cancelled" | "abandoned";
  success: boolean;
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };
  logs: JobExecutionLog[];
  context: {
    dataSourceId: Types.ObjectId;
    destinationDatabaseId: Types.ObjectId;
    syncMode: "full" | "incremental";
    entityFilter?: string[];
    cronExpression: string;
    timezone: string;
  };
  stats?: {
    recordsProcessed?: number;
    recordsCreated?: number;
    recordsUpdated?: number;
    recordsDeleted?: number;
    recordsFailed?: number;
    syncedEntities?: string[];
  };
  system: {
    workerId: string;
    workerVersion?: string;
    nodeVersion: string;
    hostname: string;
  };
}

/**
 * Helper class for managing job execution logging with heartbeat
 */
class JobExecutionLogger {
  private executionId: Types.ObjectId;
  private logs: JobExecutionLog[] = [];
  private startTime: Date;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private isCompleted = false;

  constructor(
    private jobId: Types.ObjectId,
    private workspaceId: Types.ObjectId,
    private context: _JobExecution["context"],
  ) {
    this.executionId = new Types.ObjectId();
    this.startTime = new Date();
  }

  async start(): Promise<void> {
    const execution: Partial<_JobExecution> = {
      _id: this.executionId,
      jobId: this.jobId,
      workspaceId: this.workspaceId,
      startedAt: this.startTime,
      lastHeartbeat: new Date(),
      status: "running",
      success: false,
      logs: [],
      context: this.context,
      system: {
        workerId: `${os.hostname()}-${process.pid}`,
        workerVersion: process.env.npm_package_version,
        nodeVersion: process.version,
        hostname: os.hostname(),
      },
    };

    await this.saveExecution(execution);
    this.log("info", `Job execution started: ${this.context.syncMode} sync`);

    // Start heartbeat
    this.startHeartbeat();
  }

  private startHeartbeat(): void {
    // Send heartbeat every 30 seconds
    this.heartbeatInterval = setInterval(() => {
      if (!this.isCompleted) {
        this.updateHeartbeat().catch(error => {
          console.error("Failed to update heartbeat:", error);
        });
      }
    }, 30000);
  }

  private async updateHeartbeat(): Promise<void> {
    try {
      const db = SyncJob.db;
      const collection = db.collection(JOB_EXECUTIONS_CONFIG.name);

      await collection.updateOne(
        { _id: this.executionId },
        {
          $set: {
            lastHeartbeat: new Date(),
            // Update system info in case process was replaced
            "system.workerId": `${os.hostname()}-${process.pid}`,
            "system.hostname": os.hostname(),
          },
        },
      );
    } catch (error) {
      console.error("Failed to update execution heartbeat:", error);
    }
  }

  log(level: JobExecutionLog["level"], message: string, metadata?: any): void {
    const logEntry: JobExecutionLog = {
      timestamp: new Date(),
      level,
      message,
      metadata,
    };

    this.logs.push(logEntry);

    // Also log to console with emoji
    const emoji = { debug: "🔍", info: "ℹ️", warn: "⚠️", error: "❌" }[level];
    console.log(
      `${emoji} [${this.executionId.toString().slice(-6)}] ${message}`,
    );

    // Append log to database in real-time
    void this.appendLogToDatabase(logEntry);
  }

  private async appendLogToDatabase(logEntry: JobExecutionLog): Promise<void> {
    try {
      const db = SyncJob.db;
      const collection = db.collection(JOB_EXECUTIONS_CONFIG.name);

      // Append the log entry to the logs array
      await collection.updateOne({ _id: this.executionId }, {
        $push: { logs: logEntry },
        $set: { lastHeartbeat: new Date() }, // Update heartbeat on log
      } as any);
    } catch (error) {
      console.error("Failed to append log to database:", error);
    }
  }

  async complete(
    success: boolean,
    error?: Error,
    stats?: _JobExecution["stats"],
  ): Promise<void> {
    this.isCompleted = true;

    // Stop heartbeat
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    const completedAt = new Date();
    const duration = completedAt.getTime() - this.startTime.getTime();

    const updates: Partial<_JobExecution> = {
      completedAt,
      lastHeartbeat: completedAt,
      duration,
      status: success ? "completed" : "failed",
      success,
      stats,
    };

    if (error) {
      updates.error = {
        message: error.message,
        stack: error.stack,
        code: (error as any).code,
      };
    }

    // Don't overwrite logs since we're appending them in real-time
    await this.saveExecution(updates);

    this.log(
      "info",
      `Job execution ${success ? "completed" : "failed"} in ${duration}ms (${this.logs.length} log entries)`,
    );
  }

  private async saveExecution(data: Partial<_JobExecution>): Promise<void> {
    try {
      const db = SyncJob.db;
      const collection = db.collection(JOB_EXECUTIONS_CONFIG.name);

      if (data._id) {
        // Insert new execution document
        await collection.insertOne(data as any);
      } else {
        // Update existing execution document
        await collection.updateOne({ _id: this.executionId }, {
          $set: data,
        } as any);
      }
    } catch (error) {
      console.error("Failed to save job execution:", error);
    }
  }
}

/**
 * Ensures the job_executions collection exists with proper TTL configuration
 */
async function ensureJobExecutionsCollection() {
  try {
    const db = SyncJob.db;

    // Check if collection already exists
    const collections = await db.listCollections();
    const collectionExists = collections.some(
      (col: any) => col.name === JOB_EXECUTIONS_CONFIG.name,
    );

    if (!collectionExists) {
      console.log(`📋 Creating collection: ${JOB_EXECUTIONS_CONFIG.name}`);

      // Create regular collection (not capped, so we can update documents)
      await db.createCollection(JOB_EXECUTIONS_CONFIG.name);

      console.log(`✅ Created collection: ${JOB_EXECUTIONS_CONFIG.name}`);
    } else {
      console.log(`✅ Collection ${JOB_EXECUTIONS_CONFIG.name} already exists`);
    }

    // Create indexes for efficient querying
    const collection = db.collection(JOB_EXECUTIONS_CONFIG.name);

    // Get existing indexes to check what already exists
    const existingIndexes = await collection.indexes();
    const existingIndexNames = new Set(existingIndexes.map(idx => idx.name));

    // Create indexes individually to avoid TypeScript union type issues
    const createIndexIfNotExists = async (
      keys: Record<string, number>,
      options: any,
    ) => {
      if (!existingIndexNames.has(options.name)) {
        try {
          // For TTL indexes, check if there's already an index on the same field
          if (options.expireAfterSeconds !== undefined) {
            const fieldName = Object.keys(keys)[0];
            const existingTTLIndex = existingIndexes.find(
              idx =>
                idx.key &&
                fieldName in idx.key &&
                idx.expireAfterSeconds !== undefined,
            );

            if (existingTTLIndex) {
              // Check if the existing TTL has the same expiration time
              if (
                existingTTLIndex.expireAfterSeconds ===
                options.expireAfterSeconds
              ) {
                console.log(
                  `ℹ️  TTL index on ${fieldName} already exists with same expiration, skipping ${options.name}`,
                );
                return;
              } else {
                console.log(
                  `⚠️  Existing TTL index on ${fieldName} has different expiration (${existingTTLIndex.expireAfterSeconds}s vs ${options.expireAfterSeconds}s)`,
                );
                console.log(
                  `ℹ️  Keeping existing TTL index: ${existingTTLIndex.name}, skipping ${options.name}`,
                );
                return;
              }
            }
          }

          await collection.createIndex(keys, options);
          console.log(`✅ Created index: ${options.name}`);
        } catch (error: any) {
          // Handle various index conflict scenarios
          if (error.code === 86 || error.codeName === "IndexKeySpecsConflict") {
            console.log(`ℹ️  Index ${options.name} already exists, skipping`);
          } else if (
            error.code === 85 ||
            error.codeName === "IndexOptionsConflict"
          ) {
            console.log(
              `ℹ️  Index options conflict for ${options.name}, existing index has different options, skipping`,
            );
          } else {
            console.error(`❌ Failed to create index ${options.name}:`, error);
            throw error;
          }
        }
      } else {
        console.log(`ℹ️  Index ${options.name} already exists`);
      }
    };

    await Promise.all([
      createIndexIfNotExists(
        { jobId: 1, startedAt: -1 },
        { name: "jobId_1_startedAt_-1" },
      ),
      createIndexIfNotExists(
        { workspaceId: 1, startedAt: -1 },
        { name: "workspaceId_1_startedAt_-1" },
      ),
      createIndexIfNotExists(
        { status: 1, startedAt: -1 },
        { name: "status_1_startedAt_-1" },
      ),
      createIndexIfNotExists(
        { success: 1, startedAt: -1 },
        { name: "success_1_startedAt_-1" },
      ),
      createIndexIfNotExists({ lastHeartbeat: 1 }, { name: "lastHeartbeat_1" }),
      createIndexIfNotExists(
        { "system.workerId": 1 },
        { name: "system.workerId_1" },
      ),
      createIndexIfNotExists(
        { "system.hostname": 1 },
        { name: "system.hostname_1" },
      ),
      createIndexIfNotExists(
        { completedAt: 1 },
        {
          name: "completedAt_ttl_completed",
          expireAfterSeconds: JOB_EXECUTIONS_CONFIG.ttlDays * 24 * 60 * 60,
        },
      ),
      createIndexIfNotExists(
        { completedAt: 1 },
        {
          name: "completedAt_ttl_abandoned",
          expireAfterSeconds: 7 * 24 * 60 * 60, // 7 days
          partialFilterExpression: { status: "abandoned" },
        },
      ),
    ]);

    console.log(
      `🔍 Created indexes for ${JOB_EXECUTIONS_CONFIG.name} with ${JOB_EXECUTIONS_CONFIG.ttlDays}-day TTL (7-day for abandoned)`,
    );

    // Ensure job execution locks collection with TTL
    const locksCollection = db.collection("job_execution_locks");
    try {
      await locksCollection.createIndex(
        { expiresAt: 1 },
        {
          name: "expiresAt_1_ttl",
          expireAfterSeconds: 0,
        }, // TTL index for automatic lock cleanup
      );
      console.log("🔒 Created TTL index for job execution locks");
    } catch (error: any) {
      // If index already exists, just log and continue
      if (error.code === 86 || error.codeName === "IndexKeySpecsConflict") {
        console.log("ℹ️  TTL index for job execution locks already exists");
      } else {
        console.error("❌ Failed to create locks TTL index:", error);
        throw error;
      }
    }
  } catch (error) {
    console.error(
      `❌ Failed to ensure ${JOB_EXECUTIONS_CONFIG.name} collection:`,
      error,
    );
    throw error;
  }
}

class SyncWorker {
  private scheduledJobs: Map<string, cron.ScheduledTask> = new Map();
  private isRunning = false;
  private lockExpiry: Date | null = null;
  private lockRefreshInterval: NodeJS.Timeout | null = null;

  private async retryOperation<T>(
    operation: () => Promise<T>,
    maxRetries: number,
    delay: number = 1000,
  ): Promise<T> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        console.log(
          `⚠️  Attempt ${attempt}/${maxRetries} failed:`,
          error instanceof Error ? error.message : String(error),
        );

        if (attempt === maxRetries) {
          throw error;
        }

        console.log(`⏳ Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
      }
    }
    throw new Error("Unexpected error in retry logic");
  }

  async start() {
    console.log("🚀 Starting sync worker...");

    // Connect to database
    await connectDatabase();

    // Wait a bit to ensure database is fully ready
    console.log("⏳ Waiting for database to be ready...");
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Ensure job executions collection exists with retry
    await this.retryOperation(() => ensureJobExecutionsCollection(), 3);

    // Try to acquire worker lock with retry
    const hasLock = await this.retryOperation(
      () => this.acquireWorkerLock(),
      3,
    );
    if (!hasLock) {
      console.log("❌ Another worker instance is already running. Exiting...");
      throw new Error("Worker already running");
    }

    this.isRunning = true;

    // Start lock refresh
    this.startLockRefresh();

    // Start cleanup schedule for abandoned jobs
    this.startCleanupSchedule();

    // Load and schedule jobs with retry
    await this.retryOperation(() => this.loadJobs(), 3);

    // Watch for job changes
    this.watchJobChanges();

    console.log("✅ Sync worker started successfully");

    // Handle graceful shutdown
    process.on("SIGTERM", () => void this.stop());
    process.on("SIGINT", () => void this.stop());
  }

  async stop() {
    console.log("⏹️  Stopping sync worker...");
    this.isRunning = false;

    // Stop all scheduled jobs
    this.scheduledJobs.forEach(task => {
      void task.stop();
    });
    this.scheduledJobs.clear();

    // Clear lock refresh
    if (this.lockRefreshInterval) {
      clearInterval(this.lockRefreshInterval);
    }

    // Release worker lock
    await this.releaseWorkerLock();

    console.log("✅ Sync worker stopped");
    // Allow process to exit naturally
  }

  private async loadJobs() {
    try {
      const activeJobs = await SyncJob.find({ enabled: true });
      console.log(`📋 Found ${activeJobs.length} active sync jobs`);

      // Add small startup jitter to spread out job scheduling
      for (let i = 0; i < activeJobs.length; i++) {
        const job = activeJobs[i];

        // Small delay between scheduling each job (0-5 seconds)
        if (i > 0) {
          const scheduleJitter = Math.floor(Math.random() * 5000);
          await new Promise(resolve => setTimeout(resolve, scheduleJitter));
        }

        this.scheduleJob(job);
      }
    } catch (error) {
      console.error("❌ Failed to load jobs:", error);
    }
  }

  private scheduleJob(job: any) {
    const jobId = job._id.toString();

    // Remove existing schedule if any
    const existing = this.scheduledJobs.get(jobId);
    if (existing) {
      void existing.stop();
      this.scheduledJobs.delete(jobId);
    }

    if (!job.enabled) {
      console.log(`⏸️  Job ${job.name} is disabled`);
      return;
    }

    try {
      // Create cron job
      const task = cron.schedule(
        job.schedule.cron,
        async () => {
          await this.executeJob(jobId);
        },
        {
          timezone: job.schedule.timezone || "UTC",
        },
      );

      this.scheduledJobs.set(jobId, task);
      console.log(`✅ Scheduled job: ${job.name} (${job.schedule.cron})`);
    } catch (error) {
      console.error(`❌ Failed to schedule job ${job.name}:`, error);
    }
  }

  private async executeJob(jobId: string) {
    // Add jitter to prevent thundering herd - random delay 0-60 seconds
    const jitterMs = Math.floor(Math.random() * 60000);
    console.log(`🔄 Executing job ${jobId} (jitter: ${jitterMs}ms)`);

    if (jitterMs > 0) {
      await new Promise(resolve => setTimeout(resolve, jitterMs));
    }

    let logger: JobExecutionLogger | null = null;
    let lockHeartbeatInterval: NodeJS.Timeout | null = null;

    try {
      // Get fresh job data
      const job = await SyncJob.findById(jobId);
      if (!job || !job.enabled) {
        console.log(`⏭️  Job ${jobId} is disabled or not found`);
        return;
      }

      // Initialize execution logger
      logger = new JobExecutionLogger(
        new Types.ObjectId(jobId),
        job.workspaceId,
        {
          dataSourceId: job.dataSourceId,
          destinationDatabaseId: job.destinationDatabaseId,
          syncMode: job.syncMode === "incremental" ? "incremental" : "full",
          entityFilter: job.entityFilter,
          cronExpression: job.schedule.cron,
          timezone: job.schedule.timezone || "UTC",
        },
      );

      await logger.start();
      logger.log(
        "info",
        `Starting job execution for: ${job.name} (jitter: ${jitterMs}ms)`,
      );

      // Check if job is already running (simple lock)
      const lockAcquired = await this.acquireJobLock(jobId);
      if (!lockAcquired) {
        logger.log("warn", "Job is already running, skipping execution");
        await logger.complete(false, new Error("Job already running"));
        return;
      }

      // Start lock heartbeat to keep the lock alive during long-running jobs
      lockHeartbeatInterval = setInterval(
        () => {
          this.refreshJobLock(jobId).catch((error: unknown) => {
            console.error(`Failed to refresh job lock for ${jobId}:`, error);
          });
        },
        5 * 60 * 1000,
      ); // Refresh every 5 minutes

      try {
        // Update job status
        job.lastRunAt = new Date();
        job.runCount += 1;
        await job.save();

        logger.log("info", `Job run count: ${job.runCount}`);
        logger.log("info", "Starting sync operation");

        // Execute sync with logger
        await performSync(
          job.dataSourceId.toString(),
          job.destinationDatabaseId.toString(),
          job.entityFilter,
          job.syncMode === "full",
          logger,
        );

        logger.log("info", "Sync operation completed successfully");

        // Update success
        await SyncJob.findByIdAndUpdate(jobId, {
          lastSuccessAt: new Date(),
          lastError: null,
          avgDurationMs: logger
            ? Date.now() - logger["startTime"].getTime()
            : 0,
        });

        if (logger) {
          await logger.complete(true, undefined, {
            // TODO: Get actual stats from performSync
            recordsProcessed: 0,
            recordsCreated: 0,
            recordsUpdated: 0,
          });
        }
      } finally {
        // Stop lock heartbeat
        if (lockHeartbeatInterval) {
          clearInterval(lockHeartbeatInterval);
        }

        // Release job lock
        await this.releaseJobLock(jobId);
        logger?.log("debug", "Job lock released");
      }
    } catch (error: any) {
      // Stop lock heartbeat on error
      if (lockHeartbeatInterval) {
        clearInterval(lockHeartbeatInterval);
      }

      if (logger) {
        logger.log("error", `Job execution failed: ${error.message}`);
        await logger.complete(false, error);
      } else {
        console.error(`❌ Job ${jobId} failed:`, error);
      }

      // Update error status
      await SyncJob.findByIdAndUpdate(jobId, {
        lastError: error.message || "Unknown error",
      });
    }
  }

  private watchJobChanges() {
    SyncJob.watch().on("change", change => {
      void this.handleJobChange(change);
    });
  }

  private async handleJobChange(change: any) {
    const jobId = change.documentKey?._id?.toString();
    if (!jobId) return;

    console.log(`📢 Job change detected: ${change.operationType} for ${jobId}`);

    switch (change.operationType) {
      case "insert":
      case "update":
      case "replace": {
        const job = await SyncJob.findById(jobId);
        if (job) {
          this.scheduleJob(job);
        }
        break;
      }
      case "delete": {
        const existing = this.scheduledJobs.get(jobId);
        if (existing) {
          void existing.stop();
          this.scheduledJobs.delete(jobId);
          console.log(`🗑️  Removed job ${jobId} from schedule`);
        }
        break;
      }
    }
  }

  private async acquireWorkerLock(): Promise<boolean> {
    try {
      const db = SyncJob.db;
      const now = new Date();

      // First, try to take over an expired lock
      const result = await db.collection("worker_locks").findOneAndUpdate(
        {
          _id: "sync_worker" as any,
          $or: [{ expiresAt: { $lt: now } }, { expiresAt: { $exists: false } }],
        },
        {
          $set: {
            pid: process.pid,
            hostname: process.env.HOSTNAME || "unknown",
            startedAt: now,
            expiresAt: new Date(Date.now() + 60000), // 1 minute
          },
        },
        {
          upsert: false, // Don't upsert on first attempt
          returnDocument: "after",
        },
      );

      if (result?.pid === process.pid) {
        return true;
      }

      // If no expired lock exists, try to create a new one
      try {
        await db.collection("worker_locks").insertOne({
          _id: "sync_worker" as any,
          pid: process.pid,
          hostname: process.env.HOSTNAME || "unknown",
          startedAt: now,
          expiresAt: new Date(Date.now() + 60000), // 1 minute
        });
        return true;
      } catch (insertError: any) {
        // If insert fails due to duplicate key, check if the existing lock is expired
        if (insertError.code === 11000) {
          // Force cleanup of stale lock and retry
          const existingLock = await db.collection("worker_locks").findOne({
            _id: "sync_worker" as any,
          });

          if (existingLock) {
            const lockAge =
              now.getTime() - new Date(existingLock.startedAt).getTime();
            const isExpired = existingLock.expiresAt < now;
            const isStale = lockAge > 90000; // 90 seconds

            if (isExpired || isStale) {
              console.log(
                "🔓 Found stale worker lock, forcefully removing it...",
              );
              console.log(`  Lock PID: ${existingLock.pid}`);
              console.log(`  Lock started: ${existingLock.startedAt}`);
              console.log(`  Lock expires: ${existingLock.expiresAt}`);
              console.log(`  Lock age: ${Math.round(lockAge / 1000)}s`);
              console.log(`  Reason: ${isExpired ? "expired" : "too old"}`);

              await db.collection("worker_locks").deleteOne({
                _id: "sync_worker" as any,
              });

              // Try to acquire again
              await db.collection("worker_locks").insertOne({
                _id: "sync_worker" as any,
                pid: process.pid,
                hostname: process.env.HOSTNAME || "unknown",
                startedAt: now,
                expiresAt: new Date(Date.now() + 60000), // 1 minute
              });
              return true;
            }
          }
        }
        throw insertError;
      }
    } catch (error) {
      console.error("Failed to acquire worker lock:", error);
      return false;
    }
  }

  private async releaseWorkerLock() {
    try {
      const db = SyncJob.db;
      await db.collection("worker_locks").deleteOne({
        _id: "sync_worker" as any,
        pid: process.pid,
      });
    } catch (error) {
      console.error("Failed to release worker lock:", error);
    }
  }

  private startLockRefresh() {
    console.log("🔄 Starting worker lock refresh (every 30s)");
    this.lockRefreshInterval = setInterval(() => {
      void this.refreshLock();
    }, 30000); // Every 30 seconds
  }

  private async refreshLock() {
    try {
      const db = SyncJob.db;
      const result = await db.collection("worker_locks").updateOne(
        {
          _id: "sync_worker" as any,
          pid: process.pid,
        },
        {
          $set: {
            expiresAt: new Date(Date.now() + 60000),
            lastRefresh: new Date(),
          },
        },
      );

      if (result.modifiedCount === 0) {
        console.error(
          "❌ Failed to refresh worker lock - lock not found or PID mismatch",
        );
        // Lock is gone, worker should stop
        console.error("🛑 Worker lock lost, stopping worker...");
        this.isRunning = false;
      } else {
        console.log("✅ Worker lock refreshed");
      }
    } catch (error) {
      console.error("Failed to refresh worker lock:", error);
    }
  }

  private async acquireJobLock(jobId: string): Promise<boolean> {
    try {
      const db = SyncJob.db;
      const result = await db
        .collection("job_execution_locks")
        .findOneAndUpdate(
          {
            _id: new Types.ObjectId(jobId),
            $or: [
              { expiresAt: { $lt: new Date() } },
              { expiresAt: { $exists: false } },
            ],
          },
          {
            $set: {
              pid: process.pid,
              hostname: os.hostname(),
              workerId: `${os.hostname()}-${process.pid}`,
              startedAt: new Date(),
              lastHeartbeat: new Date(),
              expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000), // 8 hours for long-running jobs
            },
          },
          {
            upsert: true,
            returnDocument: "after",
          },
        );

      return result?.pid === process.pid;
    } catch (error) {
      console.error(`Failed to acquire lock for job ${jobId}:`, error);
      return false;
    }
  }

  private async releaseJobLock(jobId: string) {
    try {
      const db = SyncJob.db;
      await db.collection("job_execution_locks").deleteOne({
        _id: new Types.ObjectId(jobId),
        pid: process.pid,
      });
      console.log(`🔓 Released lock for job ${jobId}`);
    } catch (error) {
      console.error(`Failed to release lock for job ${jobId}:`, error);
    }
  }

  private async refreshJobLock(jobId: string): Promise<void> {
    try {
      const db = SyncJob.db;
      const result = await db.collection("job_execution_locks").updateOne(
        {
          _id: new Types.ObjectId(jobId),
          pid: process.pid,
          hostname: os.hostname(),
        },
        {
          $set: {
            lastHeartbeat: new Date(),
            expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000), // Extend for another 8 hours
          },
        },
      );

      if (result.modifiedCount === 0) {
        console.warn(
          `Failed to refresh lock for job ${jobId} - lock may have been lost`,
        );
      }
    } catch (error) {
      console.error(`Failed to refresh lock for job ${jobId}:`, error);
    }
  }

  /**
   * Cleanup mechanism for abandoned job executions and stale locks
   */
  private async cleanupAbandonedJobs(): Promise<void> {
    try {
      const db = SyncJob.db;
      const now = new Date();
      const heartbeatTimeout = new Date(now.getTime() - 120000); // 2 minutes ago

      console.log("🧹 Starting cleanup of abandoned jobs...");

      // 1. Find and mark abandoned job executions
      const executionsCollection = db.collection(JOB_EXECUTIONS_CONFIG.name);

      const abandonedExecutions = await executionsCollection
        .find({
          status: "running",
          $or: [
            { lastHeartbeat: { $lt: heartbeatTimeout } },
            {
              lastHeartbeat: { $exists: false },
              startedAt: { $lt: heartbeatTimeout },
            },
          ],
        })
        .toArray();

      if (abandonedExecutions.length > 0) {
        console.log(
          `📋 Found ${abandonedExecutions.length} abandoned job executions`,
        );

        // Mark as abandoned
        await executionsCollection.updateMany(
          {
            _id: { $in: abandonedExecutions.map(e => e._id) },
          },
          {
            $set: {
              status: "abandoned",
              completedAt: now,
              error: {
                message:
                  "Job execution abandoned due to worker crash or timeout",
                code: "WORKER_TIMEOUT",
              },
            },
          },
        );

        // Log abandoned job details
        for (const execution of abandonedExecutions) {
          console.log(
            `💀 Marked execution ${execution._id} as abandoned (job: ${execution.jobId})`,
          );
        }
      }

      // 2. Clean up stale job locks (using heartbeat detection)
      const locksCollection = db.collection("job_execution_locks");

      // Find locks that are either expired OR haven't sent a heartbeat in 10 minutes
      const heartbeatStaleThreshold = new Date(now.getTime() - 600000); // 10 minutes ago

      const staleLocks = await locksCollection
        .find({
          $or: [
            { expiresAt: { $lt: now } }, // TTL expired
            {
              lastHeartbeat: { $lt: heartbeatStaleThreshold },
            }, // Heartbeat too old
            {
              lastHeartbeat: { $exists: false },
              startedAt: { $lt: heartbeatStaleThreshold }, // No heartbeat at all and old
            },
          ],
        })
        .toArray();

      if (staleLocks.length > 0) {
        console.log(`🔒 Found ${staleLocks.length} stale job locks`);

        await locksCollection.deleteMany({
          _id: { $in: staleLocks.map(lock => lock._id) },
        });

        for (const lock of staleLocks) {
          const reason =
            lock.expiresAt && lock.expiresAt < now
              ? "TTL expired"
              : "heartbeat timeout";
          console.log(`🗑️  Removed stale lock for job ${lock._id} (${reason})`);
        }
      }

      // 3. Clean up very old running executions (safety net)
      const veryOldThreshold = new Date(now.getTime() - 3600000); // 1 hour ago
      const veryOldExecutions = await executionsCollection
        .find({
          status: "running",
          startedAt: { $lt: veryOldThreshold },
        })
        .toArray();

      if (veryOldExecutions.length > 0) {
        console.log(
          `⏰ Found ${veryOldExecutions.length} very old running executions`,
        );

        await executionsCollection.updateMany(
          {
            _id: { $in: veryOldExecutions.map(e => e._id) },
          },
          {
            $set: {
              status: "abandoned",
              completedAt: now,
              error: {
                message:
                  "Job execution abandoned due to excessive runtime (safety timeout)",
                code: "SAFETY_TIMEOUT",
              },
            },
          },
        );
      }

      // 4. Clean up stale worker lock
      const workerLockCollection = db.collection("worker_locks");
      const workerLockTimeout = new Date(now.getTime() - 180000); // 3 minutes (much more conservative)

      const staleWorkerLock = await workerLockCollection.findOne({
        _id: "sync_worker" as any,
        $and: [
          { expiresAt: { $lt: now } }, // Must be expired
          {
            $or: [
              { lastRefresh: { $lt: workerLockTimeout } }, // No recent refresh
              {
                lastRefresh: { $exists: false },
                startedAt: { $lt: workerLockTimeout },
              }, // Never refreshed and old
            ],
          },
        ],
      });

      if (staleWorkerLock) {
        console.log("🔓 Found stale worker lock during cleanup");
        console.log(`  Lock PID: ${staleWorkerLock.pid}`);
        console.log(`  Lock started: ${staleWorkerLock.startedAt}`);
        console.log(`  Lock expires: ${staleWorkerLock.expiresAt}`);
        console.log(
          `  Last refresh: ${staleWorkerLock.lastRefresh || "never"}`,
        );

        await workerLockCollection.deleteOne({
          _id: "sync_worker" as any,
        });

        console.log("🗑️  Removed stale worker lock");
      }

      console.log("✅ Cleanup completed");
    } catch (error) {
      console.error("❌ Failed to cleanup abandoned jobs:", error);
    }
  }

  private startCleanupSchedule(): void {
    // Run cleanup every 5 minutes
    setInterval(() => {
      this.cleanupAbandonedJobs().catch(error => {
        console.error("Cleanup failed:", error);
      });
    }, 300000);

    // Run initial cleanup after 30 seconds
    setTimeout(() => {
      this.cleanupAbandonedJobs().catch(error => {
        console.error("Initial cleanup failed:", error);
      });
    }, 30000);
  }
}

// Export the worker and logger classes
export { SyncWorker as SyncJobWorker, JobExecutionLogger };

// Start the worker if this file is run directly
if (require.main === module) {
  const worker = new SyncWorker();
  worker.start().catch(error => {
    console.error("❌ Worker failed to start:", error);
    throw error;
  });
}
