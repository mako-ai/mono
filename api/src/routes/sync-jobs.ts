import { Hono } from "hono";
import { SyncJob, DataSource, Database } from "../database/workspace-schema";
import { Types } from "mongoose";
import { performSync } from "../services/sync-executor.service";

export const syncJobRoutes = new Hono();

// GET /api/workspaces/:workspaceId/sync-jobs - List all sync jobs
syncJobRoutes.get("/", async c => {
  try {
    const workspaceId = c.req.param("workspaceId");

    const jobs = await SyncJob.find({ workspaceId })
      .populate("dataSourceId", "name type")
      .populate("destinationDatabaseId", "name type")
      .sort({ createdAt: -1 });

    return c.json({
      success: true,
      data: jobs,
    });
  } catch (error) {
    console.error("Error listing sync jobs:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

// POST /api/workspaces/:workspaceId/sync-jobs - Create a new sync job
syncJobRoutes.post("/", async c => {
  try {
    const workspaceId = c.req.param("workspaceId");
    // TODO: Get userId from authentication
    const userId = "system";
    const body = await c.req.json();

    // Validate required fields
    const requiredFields = [
      "name",
      "dataSourceId",
      "destinationDatabaseId",
      "schedule",
    ];
    for (const field of requiredFields) {
      if (!body[field]) {
        return c.json({ success: false, error: `${field} is required` }, 400);
      }
    }

    // Validate data source exists and belongs to workspace
    const dataSource = await DataSource.findOne({
      _id: new Types.ObjectId(body.dataSourceId),
      workspaceId: new Types.ObjectId(workspaceId),
    });

    if (!dataSource) {
      return c.json({ success: false, error: "Data source not found" }, 404);
    }

    // Validate destination database exists and belongs to workspace
    const database = await Database.findOne({
      _id: new Types.ObjectId(body.destinationDatabaseId),
      workspaceId: new Types.ObjectId(workspaceId),
    });

    if (!database) {
      return c.json(
        { success: false, error: "Destination database not found" },
        404,
      );
    }

    // Create sync job
    const syncJob = new SyncJob({
      workspaceId: new Types.ObjectId(workspaceId),
      name: body.name,
      dataSourceId: new Types.ObjectId(body.dataSourceId),
      destinationDatabaseId: new Types.ObjectId(body.destinationDatabaseId),
      schedule: {
        cron: body.schedule.cron || body.schedule,
        timezone: body.schedule.timezone || body.timezone || "UTC",
      },
      entityFilter: body.entityFilter || [],
      syncMode: body.syncMode || "full",
      enabled: body.enabled !== false,
      createdBy: userId,
    });

    await syncJob.save();

    // Populate references for response
    await syncJob.populate("dataSourceId", "name type");
    await syncJob.populate("destinationDatabaseId", "name type");

    return c.json({
      success: true,
      data: syncJob,
    });
  } catch (error) {
    console.error("Error creating sync job:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

// GET /api/workspaces/:workspaceId/sync-jobs/:jobId - Get job details
syncJobRoutes.get("/:jobId", async c => {
  try {
    const workspaceId = c.req.param("workspaceId");
    const jobId = c.req.param("jobId");

    const job = await SyncJob.findOne({
      _id: new Types.ObjectId(jobId),
      workspaceId: new Types.ObjectId(workspaceId),
    })
      .populate("dataSourceId", "name type config")
      .populate("destinationDatabaseId", "name type");

    if (!job) {
      return c.json({ success: false, error: "Sync job not found" }, 404);
    }

    return c.json({
      success: true,
      data: job,
    });
  } catch (error) {
    console.error("Error getting sync job:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

// PUT /api/workspaces/:workspaceId/sync-jobs/:jobId - Update job
syncJobRoutes.put("/:jobId", async c => {
  try {
    const workspaceId = c.req.param("workspaceId");
    const jobId = c.req.param("jobId");
    const body = await c.req.json();

    // Find and validate job
    const job = await SyncJob.findOne({
      _id: new Types.ObjectId(jobId),
      workspaceId: new Types.ObjectId(workspaceId),
    });

    if (!job) {
      return c.json({ success: false, error: "Sync job not found" }, 404);
    }

    // Update allowed fields
    if (body.name) job.name = body.name;
    if (body.schedule) {
      job.schedule = {
        cron: body.schedule.cron || body.schedule,
        timezone: body.schedule.timezone || job.schedule.timezone,
      };
    }
    if (body.entityFilter !== undefined) job.entityFilter = body.entityFilter;
    if (body.syncMode) job.syncMode = body.syncMode;
    if (body.enabled !== undefined) job.enabled = body.enabled;

    await job.save();

    // Populate references for response
    await job.populate("dataSourceId", "name type");
    await job.populate("destinationDatabaseId", "name type");

    return c.json({
      success: true,
      data: job,
    });
  } catch (error) {
    console.error("Error updating sync job:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

// DELETE /api/workspaces/:workspaceId/sync-jobs/:jobId - Delete job
syncJobRoutes.delete("/:jobId", async c => {
  try {
    const workspaceId = c.req.param("workspaceId");
    const jobId = c.req.param("jobId");

    const result = await SyncJob.deleteOne({
      _id: new Types.ObjectId(jobId),
      workspaceId: new Types.ObjectId(workspaceId),
    });

    if (result.deletedCount === 0) {
      return c.json({ success: false, error: "Sync job not found" }, 404);
    }

    return c.json({
      success: true,
      message: "Sync job deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting sync job:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

// POST /api/workspaces/:workspaceId/sync-jobs/:jobId/toggle - Enable/disable job
syncJobRoutes.post("/:jobId/toggle", async c => {
  try {
    const workspaceId = c.req.param("workspaceId");
    const jobId = c.req.param("jobId");

    const job = await SyncJob.findOne({
      _id: new Types.ObjectId(jobId),
      workspaceId: new Types.ObjectId(workspaceId),
    });

    if (!job) {
      return c.json({ success: false, error: "Sync job not found" }, 404);
    }

    job.enabled = !job.enabled;
    await job.save();

    return c.json({
      success: true,
      data: {
        enabled: job.enabled,
        message: `Sync job ${job.enabled ? "enabled" : "disabled"} successfully`,
      },
    });
  } catch (error) {
    console.error("Error toggling sync job:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

// POST /api/workspaces/:workspaceId/sync-jobs/:jobId/run - Manually trigger job
syncJobRoutes.post("/:jobId/run", async c => {
  try {
    const workspaceId = c.req.param("workspaceId");
    const jobId = c.req.param("jobId");

    const job = await SyncJob.findOne({
      _id: new Types.ObjectId(jobId),
      workspaceId: new Types.ObjectId(workspaceId),
    })
      .populate("dataSourceId")
      .populate("destinationDatabaseId");

    if (!job) {
      return c.json({ success: false, error: "Sync job not found" }, 404);
    }

    // Update job status
    job.lastRunAt = new Date();
    job.runCount += 1;
    await job.save();

    // Execute sync in background
    performSync(
      job.dataSourceId._id.toString(),
      job.destinationDatabaseId._id.toString(),
      job.entityFilter,
      job.syncMode === "full",
    )
      .then(async () => {
        await SyncJob.findByIdAndUpdate(jobId, {
          lastSuccessAt: new Date(),
          lastError: null,
        });
      })
      .catch(async error => {
        await SyncJob.findByIdAndUpdate(jobId, {
          lastError: error.message || "Unknown error",
        });
      });

    return c.json({
      success: true,
      message: "Sync job triggered successfully",
      data: {
        jobId: job._id,
        startedAt: job.lastRunAt,
      },
    });
  } catch (error) {
    console.error("Error running sync job:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

// GET /api/workspaces/:workspaceId/sync-jobs/:jobId/history - Get execution history
syncJobRoutes.get("/:jobId/history", async c => {
  try {
    const workspaceId = c.req.param("workspaceId");
    const jobId = c.req.param("jobId");
    const limit = parseInt(c.req.query("limit") || "50");
    const offset = parseInt(c.req.query("offset") || "0");

    // Verify job exists and belongs to workspace
    const job = await SyncJob.findOne({
      _id: new Types.ObjectId(jobId),
      workspaceId: new Types.ObjectId(workspaceId),
    });

    if (!job) {
      return c.json({ success: false, error: "Sync job not found" }, 404);
    }

    // For now, return synthetic history based on job data
    // In a future enhancement, we could store detailed execution history
    const history = [];

    if (job.lastRunAt) {
      history.push({
        executedAt: job.lastRunAt,
        success: job.lastSuccessAt?.getTime() === job.lastRunAt.getTime(),
        error: job.lastError,
        duration: job.avgDurationMs,
      });
    }

    return c.json({
      success: true,
      data: {
        total: history.length,
        limit,
        offset,
        history,
      },
    });
  } catch (error) {
    console.error("Error getting sync job history:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});
