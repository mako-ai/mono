import { inngest } from "../client";
import { SyncJob } from "../../database/workspace-schema";
import { performSync } from "../../services/sync-executor.service";
import { Types } from "mongoose";
import * as os from "os";
import * as cronParser from "cron-parser";

// Job execution logging interface
interface JobExecutionLog {
  timestamp: Date;
  level: "debug" | "info" | "warn" | "error";
  message: string;
  metadata?: any;
}

interface JobExecution {
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

// Helper class for managing job execution logging
class JobExecutionLogger {
  private executionId: Types.ObjectId;
  private logs: JobExecutionLog[] = [];
  private startTime: Date;

  constructor(
    private jobId: Types.ObjectId,
    private workspaceId: Types.ObjectId,
    private context: JobExecution["context"],
  ) {
    this.executionId = new Types.ObjectId();
    this.startTime = new Date();
  }

  async start(): Promise<void> {
    const execution: Partial<JobExecution> = {
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
        workerId: `inngest-${os.hostname()}-${process.pid}`,
        workerVersion: process.env.npm_package_version,
        nodeVersion: process.version,
        hostname: os.hostname(),
      },
    };

    await this.saveExecution(execution);
    this.log("info", `Job execution started: ${this.context.syncMode} sync`);
  }

  log(level: JobExecutionLog["level"], message: string, metadata?: any): void {
    const logEntry: JobExecutionLog = {
      timestamp: new Date(),
      level,
      message,
      metadata,
    };

    this.logs.push(logEntry);

    // Also log to console
    const emoji = { debug: "🔍", info: "ℹ️", warn: "⚠️", error: "❌" }[level];
    console.log(
      `${emoji} [${this.executionId.toString().slice(-6)}] ${message}`,
    );

    // Append log to database
    void this.appendLogToDatabase(logEntry);
  }

  private async appendLogToDatabase(logEntry: JobExecutionLog): Promise<void> {
    try {
      const db = SyncJob.db;
      const collection = db.collection("job_executions");

      await collection.updateOne({ _id: this.executionId }, {
        $push: { logs: logEntry },
        $set: { lastHeartbeat: new Date() },
      } as any);
    } catch (error) {
      console.error("Failed to append log to database:", error);
    }
  }

  async complete(
    success: boolean,
    error?: Error,
    stats?: JobExecution["stats"],
  ): Promise<void> {
    const completedAt = new Date();
    const duration = completedAt.getTime() - this.startTime.getTime();

    const updates: Partial<JobExecution> = {
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

    await this.saveExecution(updates);

    this.log(
      "info",
      `Job execution ${success ? "completed" : "failed"} in ${duration}ms`,
    );
  }

  private async saveExecution(data: Partial<JobExecution>): Promise<void> {
    try {
      const db = SyncJob.db;
      const collection = db.collection("job_executions");

      if (data._id) {
        await collection.insertOne(data as any);
      } else {
        await collection.updateOne({ _id: this.executionId }, {
          $set: data,
        } as any);
      }
    } catch (error) {
      console.error("Failed to save job execution:", error);
    }
  }
}

// The sync job function
export const syncJobFunction = inngest.createFunction(
  {
    id: "sync-job",
    name: "Execute Sync Job",
    concurrency: {
      limit: 10, // Limit concurrent executions
      key: "event.data.jobId", // Prevent duplicate executions of the same job
    },
    retries: 2,
  },
  { event: "sync/job.execute" },
  async ({ event, step }) => {
    const { jobId } = event.data;
    
    let logger: JobExecutionLogger | null = null;

    try {
      // Add jitter to prevent thundering herd - random delay 0-60 seconds
      const jitterMs = await step.run("apply-jitter", async () => {
        const jitter = Math.floor(Math.random() * 60000);
        console.log(`🔄 Executing job ${jobId} (jitter: ${jitter}ms)`);
        
        if (jitter > 0) {
          await new Promise(resolve => setTimeout(resolve, jitter));
        }
        
        return jitter;
      });

      // Get job details
      const job = await step.run("fetch-job", async () => {
        const syncJob = await SyncJob.findById(jobId);
        if (!syncJob) {
          throw new Error(`Job ${jobId} not found`);
        }
        return syncJob.toObject();
      });

      if (!job || !job.enabled) {
        return { success: false, message: "Job is disabled" };
      }

      // Initialize logger
      logger = new JobExecutionLogger(
        new Types.ObjectId(jobId),
        new Types.ObjectId(job.workspaceId),
        {
          dataSourceId: new Types.ObjectId(job.dataSourceId),
          destinationDatabaseId: new Types.ObjectId(job.destinationDatabaseId),
          syncMode: job.syncMode === "incremental" ? "incremental" : "full",
          entityFilter: job.entityFilter,
          cronExpression: job.schedule.cron,
          timezone: job.schedule.timezone || "UTC",
        },
      );

      await logger.start();
      logger.log("info", `Starting job execution for: ${job.name} (jitter applied: ${jitterMs}ms)`);

      // Update job status
      await step.run("update-job-status", async () => {
        const jobDoc = await SyncJob.findById(jobId);
        if (jobDoc) {
          jobDoc.lastRunAt = new Date();
          jobDoc.runCount += 1;
          await jobDoc.save();
        }
      });

      logger.log("info", `Job run count: ${job.runCount + 1}`);
      logger.log("info", "Starting sync operation");

      // Execute sync
      await step.run("execute-sync", async () => {
        await performSync(
          job.dataSourceId.toString(),
          job.destinationDatabaseId.toString(),
          job.entityFilter,
          job.syncMode === "full",
          logger,
        );
      });

      logger.log("info", "Sync operation completed successfully");

      // Update success status
      await step.run("update-success-status", async () => {
        await SyncJob.findByIdAndUpdate(jobId, {
          lastSuccessAt: new Date(),
          lastError: null,
        });
      });

      if (logger) {
        await logger.complete(true, undefined, {
          recordsProcessed: 0,
          recordsCreated: 0,
          recordsUpdated: 0,
        });
      }

      return { success: true, message: "Sync completed successfully" };
    } catch (error: any) {
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

      throw error;
    }
  }
);

// Scheduled job runner function
export const scheduledSyncJobFunction = inngest.createFunction(
  {
    id: "scheduled-sync-job",
    name: "Run Scheduled Sync Jobs",
  },
  { cron: "* * * * *" }, // Run every minute to check for jobs to execute
  async ({ step }) => {
    // Get all enabled sync jobs
    const jobs = await step.run("fetch-enabled-jobs", async () => {
      return await SyncJob.find({ enabled: true });
    });

    const now = new Date();
    const executedJobs: string[] = [];
    let schedulingJitter = 0;

    // Check each job to see if it should run
    for (const job of jobs) {
      const shouldRun = await step.run(`check-job-${job._id}`, async () => {
        try {
          // Parse cron expression with timezone
          const options = {
            currentDate: now,
            tz: job.schedule.timezone || "UTC",
          };
          
          const interval = cronParser.parseExpression(job.schedule.cron, options);
          const nextRun = interval.next().toDate();
          
          // Check if the job should have run since the last execution
          const lastRun = job.lastRunAt || new Date(0);
          
          // If nextRun is in the past or very close to now (within 60 seconds), 
          // and we haven't run since then, we should run it
          const shouldExecute = nextRun <= now && lastRun < nextRun;
          
          return shouldExecute;
        } catch (error) {
          console.error(`Failed to parse cron expression for job ${job._id}:`, error);
          return false;
        }
      });

      if (shouldRun) {
        // Add small scheduling jitter (0-5 seconds) between jobs to spread out the load
        if (schedulingJitter > 0) {
          await step.sleep(`scheduling-jitter-${job._id}`, schedulingJitter);
        }
        
        // Trigger the sync job
        await step.sendEvent(`trigger-job-${job._id}`, {
          name: "sync/job.execute",
          data: { jobId: job._id.toString() },
        });
        
        executedJobs.push(job.name);
        
        // Increment jitter for next job (0-5 seconds)
        schedulingJitter = Math.floor(Math.random() * 5000);
      }
    }

    return { 
      checked: jobs.length, 
      executed: executedJobs.length,
      jobs: executedJobs 
    };
  }
);

// Manual trigger function for immediate execution
export const manualSyncJobFunction = inngest.createFunction(
  {
    id: "manual-sync-job",
    name: "Manual Sync Job Trigger",
  },
  { event: "sync/job.manual" },
  async ({ event, step }) => {
    const { jobId } = event.data;

    // Trigger the sync job
    await step.sendEvent("trigger-sync-job", {
      name: "sync/job.execute",
      data: { jobId },
    });

    return { success: true, message: `Triggered sync job: ${jobId}` };
  }
);

// Cleanup function for abandoned jobs
export const cleanupAbandonedJobsFunction = inngest.createFunction(
  {
    id: "cleanup-abandoned-jobs",
    name: "Cleanup Abandoned Jobs",
  },
  { cron: "*/5 * * * *" }, // Run every 5 minutes
  async ({ step }) => {
    const result = await step.run("cleanup-abandoned-jobs", async () => {
      const db = SyncJob.db;
      const now = new Date();
      const heartbeatTimeout = new Date(now.getTime() - 120000); // 2 minutes ago

      const executionsCollection = db.collection("job_executions");
      const locksCollection = db.collection("job_execution_locks");

      let abandonedCount = 0;
      let staleLockCount = 0;

      // 1. Find and mark abandoned job executions
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
        abandonedCount = abandonedExecutions.length;
      }

      // 2. Clean up stale job locks
      const heartbeatStaleThreshold = new Date(now.getTime() - 600000); // 10 minutes ago
      const staleLocks = await locksCollection
        .find({
          $or: [
            { expiresAt: { $lt: now } },
            { lastHeartbeat: { $lt: heartbeatStaleThreshold } },
            {
              lastHeartbeat: { $exists: false },
              startedAt: { $lt: heartbeatStaleThreshold },
            },
          ],
        })
        .toArray();

      if (staleLocks.length > 0) {
        await locksCollection.deleteMany({
          _id: { $in: staleLocks.map(lock => lock._id) },
        });
        staleLockCount = staleLocks.length;
      }

      return {
        abandonedExecutions: abandonedCount,
        staleLocks: staleLockCount,
        timestamp: now,
      };
    });

    return result;
  }
);