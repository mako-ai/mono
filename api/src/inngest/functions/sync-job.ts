import { inngest } from "../client";
import {
  SyncJob,
  ISyncJob,
  DataSource,
  Database,
} from "../../database/workspace-schema";
import {
  performSync,
  performSyncChunk,
  SyncLogger,
} from "../../services/sync-executor.service";
import { syncConnectorRegistry } from "../../sync/connector-registry";
import { databaseDataSourceManager } from "../../sync/database-data-source-manager";
import { FetchState } from "../../connectors/base/BaseConnector";
import { Types } from "mongoose";
import * as os from "os";
import { CronExpressionParser } from "cron-parser";

// Helper function to get job display name
async function getJobDisplayName(job: ISyncJob): Promise<string> {
  try {
    const [dataSource, database] = await Promise.all([
      DataSource.findById(job.dataSourceId),
      Database.findById(job.destinationDatabaseId),
    ]);

    const sourceName = dataSource?.name || job.dataSourceId.toString();
    const destName = database?.name || job.destinationDatabaseId.toString();

    return `${sourceName} → ${destName}`;
  } catch {
    // Fallback to IDs if lookup fails
    return `${job.dataSourceId} → ${job.destinationDatabaseId}`;
  }
}

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
class JobExecutionLogger implements SyncLogger {
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

  // Getter for execution ID
  getExecutionId(): string {
    return this.executionId.toString();
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
      limit: 1, // Only one execution per job at a time
      key: "event.data.jobId", // Prevent duplicate executions of the same job
    },
    retries: 2,
  },
  { event: "sync/job.execute" },
  async ({ event, step, logger }) => {
    const { jobId } = event.data;

    let executionLogger: JobExecutionLogger | undefined;
    let executionId: string | undefined;

    try {
      // Add jitter to prevent thundering herd - random delay 0-60 seconds
      const jitterMs = await step.run("apply-jitter", async () => {
        const jitter = Math.floor(Math.random() * 60000);
        logger.info(`🔄 Executing job ${jobId} (jitter: ${jitter}ms)`);

        if (jitter > 0) {
          await new Promise(resolve => setTimeout(resolve, jitter));
        }

        return jitter;
      });

      // Get job details
      const job = (await step.run("fetch-job", async () => {
        const syncJob = await SyncJob.findById(jobId);
        if (!syncJob) {
          throw new Error(`Job ${jobId} not found`);
        }
        return syncJob.toObject() as ISyncJob;
      })) as ISyncJob;

      if (!job || !job.enabled) {
        return { success: false, message: "Job is disabled" };
      }

      // Initialize logger and get execution ID
      executionId = await step.run("initialize-logger", async () => {
        executionLogger = new JobExecutionLogger(
          new Types.ObjectId(jobId),
          new Types.ObjectId(job.workspaceId),
          {
            dataSourceId: new Types.ObjectId(job.dataSourceId),
            destinationDatabaseId: new Types.ObjectId(
              job.destinationDatabaseId,
            ),
            syncMode: job.syncMode === "incremental" ? "incremental" : "full",
            entityFilter: job.entityFilter,
            cronExpression: job.schedule.cron,
            timezone: job.schedule.timezone || "UTC",
          },
        );

        await executionLogger.start();

        const jobDisplayName = await getJobDisplayName(job);
        logger.info(
          `Starting job execution for: ${jobDisplayName} (jitter applied: ${jitterMs}ms)`,
        );

        return executionLogger.getExecutionId();
      });

      // Update job status
      const currentRunCount = await step.run("update-job-status", async () => {
        const jobDoc = await SyncJob.findById(jobId);
        if (jobDoc) {
          jobDoc.lastRunAt = new Date();
          jobDoc.runCount += 1;
          await jobDoc.save();
          return jobDoc.runCount;
        }
        return job.runCount + 1;
      });

      logger.info(`Job run count: ${currentRunCount}`);

      // Validate sync configuration
      await step.run("validate-sync-config", async () => {
        logger.info("Validating sync configuration");
        logger.info(`Sync mode: ${job.syncMode}`);
        logger.info(`Data source ID: ${job.dataSourceId}`);
        logger.info(`Destination database ID: ${job.destinationDatabaseId}`);
        if (job.entityFilter && job.entityFilter.length > 0) {
          logger.info(`Entity filter: ${job.entityFilter.join(", ")}`);
        }
        return true;
      });

      // Log execution ID
      logger.info(`Execution ID: ${executionId}`);

      // Check if connector supports chunked execution
      const supportsChunking = await step.run(
        "check-chunking-support",
        async () => {
          const dataSource = await databaseDataSourceManager.getDataSource(
            job.dataSourceId.toString(),
          );
          if (!dataSource) {
            throw new Error(`Data source not found: ${job.dataSourceId}`);
          }

          const connector =
            await syncConnectorRegistry.getConnector(dataSource);
          if (!connector) {
            throw new Error(
              `Failed to create connector for type: ${dataSource.type}`,
            );
          }

          const supports = connector.supportsResumableFetching();
          logger.info(
            `Connector ${dataSource.type} supports chunked execution: ${supports}`,
          );
          return supports;
        },
      );

      if (supportsChunking) {
        // Get entities to sync
        const entitiesToSync = await step.run(
          "get-entities-to-sync",
          async () => {
            const dataSource = await databaseDataSourceManager.getDataSource(
              job.dataSourceId.toString(),
            );
            if (!dataSource) {
              throw new Error(`Data source not found: ${job.dataSourceId}`);
            }

            const connector =
              await syncConnectorRegistry.getConnector(dataSource);
            if (!connector) {
              throw new Error(
                `Failed to create connector for type: ${dataSource.type}`,
              );
            }

            const availableEntities = connector.getAvailableEntities();

            if (job.entityFilter && job.entityFilter.length > 0) {
              // Validate requested entities
              const invalidEntities = job.entityFilter.filter(
                e => !availableEntities.includes(e),
              );
              if (invalidEntities.length > 0) {
                throw new Error(
                  `Invalid entities: ${invalidEntities.join(", ")}. Available: ${availableEntities.join(", ")}`,
                );
              }
              return job.entityFilter;
            } else {
              return availableEntities;
            }
          },
        );

        // Process each entity with chunked execution
        for (const entity of entitiesToSync) {
          logger.info(`Starting chunked sync for entity: ${entity}`);

          let state: FetchState | undefined;
          let chunkIndex = 0;
          let completed = false;

          while (!completed) {
            const chunkResult = await step.run(
              `sync-${entity}-chunk-${chunkIndex}`,
              async () => {
                logger.info(
                  `Executing chunk ${chunkIndex} for entity ${entity}`,
                );

                // Create sync logger wrapper
                const syncLogger: SyncLogger = {
                  log: (level: string, message: string, metadata?: any) => {
                    switch (level) {
                      case "debug":
                        logger.debug(message, metadata);
                        break;
                      case "info":
                        logger.info(message, metadata);
                        break;
                      case "warn":
                        logger.warn(message, metadata);
                        break;
                      case "error":
                        logger.error(message, metadata);
                        break;
                      default:
                        logger.info(message, metadata);
                        break;
                    }
                    if (executionLogger) {
                      executionLogger.log(level as any, message, metadata);
                    }
                  },
                };

                const result = await performSyncChunk({
                  dataSourceId: job.dataSourceId.toString(),
                  destinationId: job.destinationDatabaseId.toString(),
                  entity,
                  isIncremental: job.syncMode === "incremental",
                  state,
                  maxIterations: 10, // Run 10 API calls per chunk
                  logger: syncLogger,
                  step, // Pass Inngest step for serverless-friendly retries
                });

                logger.info(
                  `Chunk ${chunkIndex} completed. Processed ${result.state.totalProcessed} records total. Has more: ${!result.completed}`,
                );

                return result;
              },
            );

            state = chunkResult.state;
            completed = chunkResult.completed;
            chunkIndex++;

            if (chunkIndex > 1000) {
              // Safety limit to prevent infinite loops
              throw new Error(
                `Too many chunks (${chunkIndex}) for entity ${entity}. Possible infinite loop.`,
              );
            }
          }

          logger.info(
            `✅ Completed chunked sync for entity ${entity} after ${chunkIndex} chunks`,
          );
        }
      } else {
        // Fall back to non-chunked execution for connectors that don't support it
        await step.run("execute-sync", async () => {
          logger.info(`Starting ${job.syncMode} sync operation (non-chunked)`);

          try {
            // Create a sync logger that wraps Inngest's logger
            const syncLogger: SyncLogger = {
              log: (level: string, message: string, metadata?: any) => {
                // Call specific logger methods directly to avoid dynamic property access issues
                switch (level) {
                  case "debug":
                    logger.debug(message, metadata);
                    break;
                  case "info":
                    logger.info(message, metadata);
                    break;
                  case "warn":
                    logger.warn(message, metadata);
                    break;
                  case "error":
                    logger.error(message, metadata);
                    break;
                  default:
                    logger.info(message, metadata);
                    break;
                }
                // Also log to database if executionLogger is available
                if (executionLogger) {
                  executionLogger.log(level as any, message, metadata);
                }
              },
            };

            await performSync(
              job.dataSourceId.toString(),
              job.destinationDatabaseId.toString(),
              job.entityFilter,
              job.syncMode === "incremental",
              syncLogger,
              step, // Pass Inngest step for serverless-friendly retries
            );

            logger.info("Sync operation completed successfully");
            return { success: true };
          } catch (error: any) {
            logger.error(`Sync operation failed: ${error.message}`, error);
            throw error;
          }
        });
      }

      // Update job success status
      await step.run("update-success-status", async () => {
        logger.info("Updating job success status");
        await SyncJob.findByIdAndUpdate(jobId, {
          lastSuccessAt: new Date(),
          lastError: null,
        });
      });

      // Complete execution logging
      await step.run("complete-execution", async () => {
        logger.info("Completing execution logging");
        if (executionLogger) {
          await executionLogger.complete(true, undefined, {
            recordsProcessed: 0,
            recordsCreated: 0,
            recordsUpdated: 0,
          });
        }
      });

      return { success: true, message: "Sync completed successfully" };
    } catch (error: any) {
      logger.error(`Job ${jobId} failed:`, error);

      if (executionLogger) {
        await executionLogger.complete(false, error);
      }

      // Update error status
      await SyncJob.findByIdAndUpdate(jobId, {
        lastError: error.message || "Unknown error",
      });

      throw error;
    }
  },
);

// Scheduled job runner function
export const scheduledSyncJobFunction = inngest.createFunction(
  {
    id: "scheduled-sync-job",
    name: "Run Scheduled Sync Jobs",
  },
  { cron: "*/5 * * * *" }, // Run every 5 minutes to check for jobs to execute
  async ({ step }) => {
    console.log(
      "\n🕐 Scheduled sync job runner triggered at:",
      new Date().toISOString(),
    );

    // Get all enabled sync jobs
    const jobs = (await step.run("fetch-enabled-jobs", async () => {
      const syncJobs = await SyncJob.find({ enabled: true });
      console.log(`📋 Found ${syncJobs.length} enabled sync jobs`);
      return syncJobs.map(job => job.toObject() as ISyncJob);
    })) as ISyncJob[];

    const now = new Date();
    const executedJobs: string[] = [];
    let schedulingJitter = 0;

    // Check each job to see if it should run
    for (const job of jobs) {
      const shouldRun = await step.run(`check-job-${job._id}`, async () => {
        try {
          const jobDisplayName = await getJobDisplayName(job);
          console.log(`\n🔍 Checking job: ${jobDisplayName} (${job._id})`);
          console.log(`   Cron expression: ${job.schedule.cron}`);
          console.log(`   Timezone: ${job.schedule.timezone || "UTC"}`);
          console.log(`   Current time: ${now.toISOString()}`);

          // Convert lastRunAt to Date if needed
          console.log(
            `   Last run at raw value: ${job.lastRunAt} (type: ${typeof job.lastRunAt})`,
          );
          const lastRunDate = job.lastRunAt ? new Date(job.lastRunAt) : null;
          console.log(
            `   Last run at: ${lastRunDate ? lastRunDate.toISOString() : "Never"}`,
          );

          // Parse cron expression with timezone
          const options = {
            currentDate: now,
            tz: job.schedule.timezone || "UTC",
          };

          const interval = CronExpressionParser.parse(
            job.schedule.cron,
            options,
          );
          const nextRun = interval.next().toDate();

          // Try to get previous run time as well
          let prevRun: Date | null = null;
          try {
            const prevInterval = CronExpressionParser.parse(
              job.schedule.cron,
              options,
            );
            prevRun = prevInterval.prev().toDate();
          } catch {
            // Might fail if there's no previous occurrence
          }

          console.log(`   Next run: ${nextRun.toISOString()}`);
          if (prevRun) {
            console.log(`   Previous scheduled run: ${prevRun.toISOString()}`);
          }
          console.log(`   Next run timestamp: ${nextRun.getTime()}`);
          console.log(`   Current timestamp: ${now.getTime()}`);
          console.log(
            `   Time until next run: ${nextRun.getTime() - now.getTime()}ms`,
          );

          // Check if the job should have run since the last execution
          const lastRun = lastRunDate || new Date(0);

          // Check if we missed any scheduled runs
          let missedRun = false;
          if (prevRun && lastRun < prevRun && prevRun <= now) {
            missedRun = true;
            console.log(
              `   ⚠️  Missed scheduled run at: ${prevRun.toISOString()}`,
            );
          }

          // Alternative logic: Check if enough time has passed since last run
          // based on the cron schedule
          let alternativeShouldRun = false;
          if (lastRun.getTime() > 0) {
            // Parse from last run time to see when next run should have been
            const intervalFromLastRun = CronExpressionParser.parse(
              job.schedule.cron,
              {
                currentDate: lastRun,
                tz: job.schedule.timezone || "UTC",
              },
            );
            const nextRunFromLastRun = intervalFromLastRun.next().toDate();
            alternativeShouldRun = nextRunFromLastRun <= now;
            console.log(
              `   Next run from last run: ${nextRunFromLastRun.toISOString()}`,
            );
            console.log(`   Should have run by now: ${alternativeShouldRun}`);
          }

          // Original logic (likely always false since nextRun is future)
          const shouldExecute = nextRun <= now && lastRun < nextRun;

          console.log(`   Next run <= now: ${nextRun <= now}`);
          console.log(`   Last run < next run: ${lastRun < nextRun}`);
          console.log(`   Should execute (original logic): ${shouldExecute}`);
          console.log(
            `   Should execute (alternative logic): ${alternativeShouldRun}`,
          );
          console.log(`   Should execute (missed run): ${missedRun}`);

          // Use the alternative logic instead
          return alternativeShouldRun || missedRun;
        } catch (error) {
          console.error(
            `Failed to parse cron expression for job ${job._id}:`,
            error,
          );
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

        const jobDisplayName = await getJobDisplayName(job);
        executedJobs.push(jobDisplayName);

        // Increment jitter for next job (0-5 seconds)
        schedulingJitter = Math.floor(Math.random() * 5000);
      }
    }

    console.log("\n✅ Scheduled job runner summary:");
    console.log(`   Jobs checked: ${jobs.length}`);
    console.log(`   Jobs executed: ${executedJobs.length}`);
    if (executedJobs.length > 0) {
      console.log(`   Executed jobs: ${executedJobs.join(", ")}`);
    }

    return {
      checked: jobs.length,
      executed: executedJobs.length,
      jobs: executedJobs,
    };
  },
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
  },
);

// Cleanup function for abandoned jobs
export const cleanupAbandonedJobsFunction = inngest.createFunction(
  {
    id: "cleanup-abandoned-jobs",
    name: "Cleanup Abandoned Jobs",
  },
  { cron: "*/15 * * * *" }, // Run every 15 minutes
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
  },
);
