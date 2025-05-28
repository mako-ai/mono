import { Hono } from "hono";
import { DataSourceManager } from "../utils/data-source-manager";

export const dataSourceRoutes = new Hono();
const dataSourceManager = new DataSourceManager();

// GET /api/data-sources - List all data sources
dataSourceRoutes.get("/", async (c) => {
  try {
    const dataSources = await dataSourceManager.listDataSources();
    return c.json({ success: true, data: dataSources });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

// GET /api/data-sources/:id - Get specific data source
dataSourceRoutes.get("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const dataSource = await dataSourceManager.getDataSource(id);

    if (!dataSource) {
      return c.json({ success: false, error: "Data source not found" }, 404);
    }

    return c.json({ success: true, data: dataSource });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

// POST /api/data-sources - Create new data source
dataSourceRoutes.post("/", async (c) => {
  try {
    const body = await c.req.json();

    // Validate required fields
    if (!body.name || !body.source) {
      return c.json(
        {
          success: false,
          error: "Name and source are required",
        },
        400
      );
    }

    // Set defaults for optional fields
    const dataSource = {
      name: body.name,
      description: body.description || "",
      source: body.source,
      enabled: body.enabled !== undefined ? body.enabled : true,
      config: body.config || {},
      settings: {
        sync_batch_size: body.settings?.sync_batch_size || 100,
        rate_limit_delay_ms: body.settings?.rate_limit_delay_ms || 200,
        max_retries: body.settings?.max_retries || 3,
        timeout_ms: body.settings?.timeout_ms || 30000,
      },
      tenant: body.tenant,
    };

    const created = await dataSourceManager.createDataSource(dataSource);
    return c.json(
      {
        success: true,
        data: created,
        message: "Data source created successfully",
      },
      201
    );
  } catch (error) {
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

// PUT /api/data-sources/:id - Update existing data source
dataSourceRoutes.put("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json();

    // Remove fields that shouldn't be updated directly
    const { _id, created_at, ...updates } = body;

    const updated = await dataSourceManager.updateDataSource(id, updates);
    return c.json({
      success: true,
      data: updated,
      message: "Data source updated successfully",
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

// DELETE /api/data-sources/:id - Delete data source
dataSourceRoutes.delete("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    await dataSourceManager.deleteDataSource(id);
    return c.json({
      success: true,
      message: "Data source deleted successfully",
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

// POST /api/data-sources/:id/test - Test data source connection
dataSourceRoutes.post("/:id/test", async (c) => {
  try {
    const id = c.req.param("id");
    const result = await dataSourceManager.testConnection(id);
    return c.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

// PATCH /api/data-sources/:id/enable - Enable/disable data source
dataSourceRoutes.patch("/:id/enable", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json();

    if (typeof body.enabled !== "boolean") {
      return c.json(
        {
          success: false,
          error: "Enabled field must be a boolean",
        },
        400
      );
    }

    const updated = await dataSourceManager.updateDataSource(id, {
      enabled: body.enabled,
    });

    return c.json({
      success: true,
      data: updated,
      message: `Data source ${
        body.enabled ? "enabled" : "disabled"
      } successfully`,
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});
