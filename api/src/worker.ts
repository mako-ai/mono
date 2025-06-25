import * as cron from "node-cron";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";
import { connectDatabase } from "./database/schema";
import { SyncJob } from "./database/workspace-schema";
import { performSync } from "./services/sync-executor.service";
import { Types } from "mongoose";

// Load environment variables
const envPath = path.resolve(__dirname, "../../.env");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

class SyncWorker {
  private scheduledJobs: Map<string, cron.ScheduledTask> = new Map();
  private isRunning = false;
  private lockExpiry: Date | null = null;
  private lockRefreshInterval: NodeJS.Timeout | null = null;

  async start() {
    console.log("🚀 Starting sync worker...");

    // Connect to database
    await connectDatabase();

    // Try to acquire worker lock
    const hasLock = await this.acquireWorkerLock();
    if (!hasLock) {
      console.log("❌ Another worker instance is already running. Exiting...");
      throw new Error("Worker already running");
    }

    this.isRunning = true;

    // Start lock refresh
    this.startLockRefresh();

    // Load and schedule jobs
    await this.loadJobs();

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

      for (const job of activeJobs) {
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
    console.log(`🔄 Executing job ${jobId}`);
    const startTime = Date.now();

    try {
      // Get fresh job data
      const job = await SyncJob.findById(jobId);
      if (!job || !job.enabled) {
        console.log(`⏭️  Job ${jobId} is disabled or not found`);
        return;
      }

      // Check if job is already running (simple lock)
      const lockAcquired = await this.acquireJobLock(jobId);
      if (!lockAcquired) {
        console.log(`⏭️  Job ${jobId} is already running`);
        return;
      }

      try {
        // Update job status
        job.lastRunAt = new Date();
        job.runCount += 1;
        await job.save();

        // Execute sync
        await performSync(
          job.dataSourceId.toString(),
          job.destinationDatabaseId.toString(),
          job.entityFilter,
          job.syncMode === "incremental",
        );

        // Update success
        const duration = Date.now() - startTime;
        await SyncJob.findByIdAndUpdate(jobId, {
          lastSuccessAt: new Date(),
          lastError: null,
          avgDurationMs: duration,
        });

        console.log(`✅ Job ${jobId} completed in ${duration}ms`);
      } finally {
        // Release job lock
        await this.releaseJobLock(jobId);
      }
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error(`❌ Job ${jobId} failed after ${duration}ms:`, error);

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
      const result = await db.collection("worker_locks").findOneAndUpdate(
        {
          _id: "sync_worker" as any,
          $or: [
            { expiresAt: { $lt: new Date() } },
            { expiresAt: { $exists: false } },
          ],
        },
        {
          $set: {
            pid: process.pid,
            hostname: process.env.HOSTNAME || "unknown",
            startedAt: new Date(),
            expiresAt: new Date(Date.now() + 60000), // 1 minute
          },
        },
        {
          upsert: true,
          returnDocument: "after",
        },
      );

      return result?.pid === process.pid;
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
    this.lockRefreshInterval = setInterval(() => {
      void this.refreshLock();
    }, 30000); // Every 30 seconds
  }

  private async refreshLock() {
    try {
      const db = SyncJob.db;
      await db.collection("worker_locks").updateOne(
        {
          _id: "sync_worker" as any,
          pid: process.pid,
        },
        {
          $set: {
            expiresAt: new Date(Date.now() + 60000),
          },
        },
      );
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
              startedAt: new Date(),
              expiresAt: new Date(Date.now() + 3600000), // 1 hour max
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
    } catch (error) {
      console.error(`Failed to release lock for job ${jobId}:`, error);
    }
  }
}

// Export the worker class
export { SyncWorker as SyncJobWorker };

// Start the worker if this file is run directly
if (require.main === module) {
  const worker = new SyncWorker();
  worker.start().catch(error => {
    console.error("❌ Worker failed to start:", error);
    throw error;
  });
}
