import { Hono } from "hono";
import { QueryManager } from "../utils/query-manager";

export const queryRoutes = new Hono();
const queryManager = new QueryManager();

// GET /api/queries - List all queries
queryRoutes.get("/", async (c) => {
  try {
    const queries = await queryManager.listQueries();
    return c.json({ success: true, data: queries });
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

// GET /api/queries/:path - Get specific query content
queryRoutes.get("/:path{.+}", async (c) => {
  try {
    const queryPath = c.req.param("path");
    const content = await queryManager.getQuery(queryPath);
    return c.json({ success: true, data: { path: queryPath, content } });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Query not found",
      },
      404
    );
  }
});

// POST /api/queries/:path - Create new query
queryRoutes.post("/:path{.+}", async (c) => {
  try {
    const queryPath = c.req.param("path");
    const body = await c.req.json();

    if (!body.content) {
      return c.json({ success: false, error: "Content is required" }, 400);
    }

    const exists = await queryManager.queryExists(queryPath);
    if (exists) {
      return c.json({ success: false, error: "Query already exists" }, 409);
    }

    await queryManager.saveQuery(queryPath, body.content);
    return c.json({ success: true, message: "Query created successfully" });
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

// PUT /api/queries/:path - Update existing query
queryRoutes.put("/:path{.+}", async (c) => {
  try {
    const queryPath = c.req.param("path");
    const body = await c.req.json();

    if (!body.content) {
      return c.json({ success: false, error: "Content is required" }, 400);
    }

    await queryManager.saveQuery(queryPath, body.content);
    return c.json({ success: true, message: "Query updated successfully" });
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
