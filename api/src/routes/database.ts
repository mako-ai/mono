import { Hono } from "hono";
import { DatabaseManager } from "../utils/database-manager";

export const databaseRoutes = new Hono();
const databaseManager = new DatabaseManager();

// GET /api/database/collections - List all collections
databaseRoutes.get("/collections", async c => {
  try {
    const databaseId = c.req.query("databaseId");
    if (!databaseId) {
      return c.json({ success: false, error: "Database ID is required" }, 400);
    }

    const collections = await databaseManager.listCollections(databaseId);
    return c.json({ success: true, data: collections });
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

// GET /api/database/views - List all views
databaseRoutes.get("/views", async c => {
  try {
    const databaseId = c.req.query("databaseId");
    if (!databaseId) {
      return c.json({ success: false, error: "Database ID is required" }, 400);
    }

    const views = await databaseManager.listViews(databaseId);
    return c.json({ success: true, data: views });
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

// POST /api/database/collections - Create a new collection
databaseRoutes.post("/collections", async c => {
  try {
    const body = await c.req.json();

    if (!body.databaseId) {
      return c.json({ success: false, error: "Database ID is required" }, 400);
    }

    if (!body.name) {
      return c.json(
        { success: false, error: "Collection name is required" },
        400,
      );
    }

    const result = await databaseManager.createCollection(
      body.databaseId,
      body.name,
      body.options,
    );
    return c.json({
      success: true,
      message: "Collection created successfully",
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

// POST /api/database/views - Create a new view
databaseRoutes.post("/views", async c => {
  try {
    const body = await c.req.json();

    if (!body.databaseId) {
      return c.json({ success: false, error: "Database ID is required" }, 400);
    }

    if (!body.name || !body.viewOn || !body.pipeline) {
      return c.json(
        {
          success: false,
          error:
            "View name, viewOn (source collection), and pipeline are required",
        },
        400,
      );
    }

    const result = await databaseManager.createView(
      body.databaseId,
      body.name,
      body.viewOn,
      body.pipeline,
      body.options,
    );
    return c.json({
      success: true,
      message: "View created successfully",
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

// DELETE /api/database/collections/:name - Delete a collection
databaseRoutes.delete("/collections/:name", async c => {
  try {
    const collectionName = c.req.param("name");
    const databaseId = c.req.query("databaseId");

    if (!databaseId) {
      return c.json({ success: false, error: "Database ID is required" }, 400);
    }

    const result = await databaseManager.deleteCollection(
      databaseId,
      collectionName,
    );
    return c.json({
      success: true,
      message: "Collection deleted successfully",
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

// DELETE /api/database/views/:name - Delete a view
databaseRoutes.delete("/views/:name", async c => {
  try {
    const viewName = c.req.param("name");
    const databaseId = c.req.query("databaseId");

    if (!databaseId) {
      return c.json({ success: false, error: "Database ID is required" }, 400);
    }

    const result = await databaseManager.deleteView(databaseId, viewName);
    return c.json({
      success: true,
      message: "View deleted successfully",
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

// GET /api/database/collections/:name/info - Get collection information
databaseRoutes.get("/collections/:name/info", async c => {
  try {
    const collectionName = c.req.param("name");
    const databaseId = c.req.query("databaseId");

    if (!databaseId) {
      return c.json({ success: false, error: "Database ID is required" }, 400);
    }

    const info = await databaseManager.getCollectionInfo(
      databaseId,
      collectionName,
    );
    return c.json({
      success: true,
      data: info,
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

// GET /api/database/views/:name/info - Get view information
databaseRoutes.get("/views/:name/info", async c => {
  try {
    const viewName = c.req.param("name");
    const databaseId = c.req.query("databaseId");

    if (!databaseId) {
      return c.json({ success: false, error: "Database ID is required" }, 400);
    }

    const info = await databaseManager.getViewInfo(databaseId, viewName);
    return c.json({
      success: true,
      data: info,
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
