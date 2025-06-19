import { Hono } from "hono";
import { DataSource } from "../database/workspace-schema";
import { connectorRegistry } from "../connectors/registry";
import { getUserFromRequest } from "../middleware/auth";
import * as crypto from "crypto";

export const dataSourceRoutes = new Hono();

// GET /api/workspaces/:workspaceId/sources - List all data sources for a workspace
dataSourceRoutes.get("/", async c => {
  try {
    const workspaceId = c.req.param("workspaceId");
    // TODO: Add authentication and permission check
    // const user = await getUserFromRequest(c);

    if (!workspaceId) {
      return c.json({ success: false, error: "Workspace ID is required" }, 400);
    }

    const dataSources = await DataSource.find({
      workspaceId,
      // TODO: Add permission check
    })
      .sort({ createdAt: -1 })
      .lean();

    return c.json({ success: true, data: dataSources });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

// GET /api/workspaces/:workspaceId/sources/:id - Get specific data source
dataSourceRoutes.get("/:id", async c => {
  try {
    const workspaceId = c.req.param("workspaceId");
    const id = c.req.param("id");
    // TODO: Add authentication and permission check

    const dataSource = await DataSource.findOne({
      _id: id,
      workspaceId,
    }).lean();

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
      500,
    );
  }
});

// POST /api/workspaces/:workspaceId/sources - Create new data source
dataSourceRoutes.post("/", async c => {
  try {
    const workspaceId = c.req.param("workspaceId");
    // TODO: Add authentication
    // const user = await getUserFromRequest(c);
    const body = await c.req.json();

    // Validate required fields
    if (!body.name || !body.type) {
      return c.json(
        {
          success: false,
          error: "Name and type are required",
        },
        400,
      );
    }

    // Check if connector type is supported
    if (!connectorRegistry.hasConnector(body.type)) {
      return c.json(
        {
          success: false,
          error: `Unsupported source type: ${body.type}`,
        },
        400,
      );
    }

    // Create data source
    const dataSource = new DataSource({
      workspaceId,
      name: body.name,
      type: body.type,
      description: body.description,
      config: body.config || {},
      settings: {
        sync_batch_size: body.settings?.sync_batch_size || 100,
        rate_limit_delay_ms: body.settings?.rate_limit_delay_ms || 200,
        max_retries: body.settings?.max_retries || 3,
        timeout_ms: body.settings?.timeout_ms || 30000,
        timezone: body.settings?.timezone || "UTC",
      },
      targetDatabases: body.targetDatabases || [],
      createdBy: "system", // TODO: Use actual user ID
      isActive: body.isActive !== false,
    });

    await dataSource.save();

    return c.json(
      {
        success: true,
        data: dataSource.toObject(),
        message: "Data source created successfully",
      },
      201,
    );
  } catch (error) {
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

// PUT /api/workspaces/:workspaceId/sources/:id - Update existing data source
dataSourceRoutes.put("/:id", async c => {
  try {
    const workspaceId = c.req.param("workspaceId");
    const id = c.req.param("id");
    // TODO: Add authentication and permission check
    const body = await c.req.json();

    // Find existing data source
    const dataSource = await DataSource.findOne({
      _id: id,
      workspaceId,
    });

    if (!dataSource) {
      return c.json({ success: false, error: "Data source not found" }, 404);
    }

    // Update fields
    if (body.name !== undefined) {
      dataSource.name = body.name;
    }
    if (body.description !== undefined) {
      dataSource.description = body.description;
    }
    if (body.config !== undefined) {
      dataSource.config = body.config;
    }
    if (body.settings !== undefined) {
      dataSource.settings = {
        ...dataSource.settings,
        ...body.settings,
      };
    }
    if (body.targetDatabases !== undefined) {
      dataSource.targetDatabases = body.targetDatabases;
    }
    if (body.isActive !== undefined) {
      dataSource.isActive = body.isActive;
    }

    await dataSource.save();

    return c.json({
      success: true,
      data: dataSource.toObject(),
      message: "Data source updated successfully",
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

// DELETE /api/workspaces/:workspaceId/sources/:id - Delete data source
dataSourceRoutes.delete("/:id", async c => {
  try {
    const workspaceId = c.req.param("workspaceId");
    const id = c.req.param("id");
    // TODO: Add authentication and permission check

    const result = await DataSource.deleteOne({
      _id: id,
      workspaceId,
    });

    if (result.deletedCount === 0) {
      return c.json({ success: false, error: "Data source not found" }, 404);
    }

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
      500,
    );
  }
});

// POST /api/workspaces/:workspaceId/sources/:id/test - Test data source connection
dataSourceRoutes.post("/:id/test", async c => {
  try {
    const workspaceId = c.req.param("workspaceId");
    const id = c.req.param("id");
    // TODO: Add authentication and permission check

    const dataSource = await DataSource.findOne({
      _id: id,
      workspaceId,
    });

    if (!dataSource) {
      return c.json({ success: false, error: "Data source not found" }, 404);
    }

    // Get connector and test connection
    const connector = connectorRegistry.getConnector(dataSource);
    if (!connector) {
      return c.json(
        {
          success: false,
          error: `No connector available for type: ${dataSource.type}`,
        },
        500,
      );
    }

    const result = await connector.testConnection();

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
      500,
    );
  }
});

// PATCH /api/workspaces/:workspaceId/sources/:id/enable - Enable/disable data source
dataSourceRoutes.patch("/:id/enable", async c => {
  try {
    const workspaceId = c.req.param("workspaceId");
    const id = c.req.param("id");
    // TODO: Add authentication and permission check
    const body = await c.req.json();

    if (typeof body.enabled !== "boolean") {
      return c.json(
        {
          success: false,
          error: "Enabled field must be a boolean",
        },
        400,
      );
    }

    const dataSource = await DataSource.findOneAndUpdate(
      {
        _id: id,
        workspaceId,
      },
      {
        isActive: body.enabled,
      },
      {
        new: true,
      },
    );

    if (!dataSource) {
      return c.json({ success: false, error: "Data source not found" }, 404);
    }

    return c.json({
      success: true,
      data: dataSource.toObject(),
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
      500,
    );
  }
});

// GET /api/workspaces/:workspaceId/sources/connectors/types - Get available connectors
dataSourceRoutes.get("/connectors/types", async c => {
  try {
    const connectors = connectorRegistry.getAllMetadata();

    return c.json({
      success: true,
      data: connectors.map(c => ({
        type: c.type,
        ...c.metadata,
      })),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

// POST /api/workspaces/:workspaceId/sources/decrypt - Decrypt a value for debugging
dataSourceRoutes.post("/decrypt", async c => {
  try {
    const { encryptedValue } = await c.req.json();

    if (!encryptedValue) {
      return c.json(
        {
          success: false,
          error: "Encrypted value is required",
        },
        400,
      );
    }

    // Get encryption key from environment
    const encryptionKey = process.env.ENCRYPTION_KEY;
    if (!encryptionKey) {
      return c.json(
        {
          success: false,
          error: "ENCRYPTION_KEY not configured",
        },
        500,
      );
    }

    // Check if the value is encrypted (contains ':')
    if (!encryptedValue.includes(":")) {
      return c.json({
        success: true,
        data: {
          decryptedValue: encryptedValue,
          wasEncrypted: false,
        },
      });
    }

    try {
      // Parse the encrypted string (format: iv:encrypted_data)
      const textParts = encryptedValue.split(":");
      if (textParts.length < 2) {
        return c.json(
          {
            success: false,
            error: "Invalid encrypted format (expected iv:data)",
          },
          400,
        );
      }

      const iv = Buffer.from(textParts[0], "hex");
      const encryptedText = Buffer.from(textParts.slice(1).join(":"), "hex");

      // Decrypt using AES-256-CBC
      const decipher = crypto.createDecipheriv(
        "aes-256-cbc",
        Buffer.from(encryptionKey, "hex"),
        iv,
      );

      let decrypted = decipher.update(encryptedText);
      decrypted = Buffer.concat([decrypted, decipher.final()]);

      return c.json({
        success: true,
        data: {
          decryptedValue: decrypted.toString(),
          wasEncrypted: true,
        },
      });
    } catch (error: any) {
      console.error("Decryption error:", error);
      return c.json(
        {
          success: false,
          error: `Decryption failed: ${error.message}`,
          details: {
            code: error.code,
            message: error.message,
          },
        },
        400,
      );
    }
  } catch (error: any) {
    console.error("Decrypt endpoint error:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});
