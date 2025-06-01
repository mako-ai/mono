import { Hono } from "hono";
import { QueryManager } from "../utils/query-manager";
import { QueryExecutor } from "../utils/query-executor";

export const executeRoutes = new Hono();
const queryManager = new QueryManager();
const queryExecutor = new QueryExecutor();

// POST /api/execute - Execute query content directly from request body
executeRoutes.post("/", async (c) => {
  try {
    const body = await c.req.json();

    if (!body.content) {
      return c.json(
        {
          success: false,
          error: "Query content is required in request body",
        },
        400
      );
    }

    // Execute query content directly with optional database ID
    const results = await queryExecutor.executeQuery(
      body.content,
      body.databaseId
    );

    return c.json({
      success: true,
      data: {
        results,
        executedAt: new Date().toISOString(),
        resultCount: Array.isArray(results) ? results.length : 1,
      },
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Query execution failed",
      },
      500
    );
  }
});

// POST /api/run/:path - Execute query and return results (legacy endpoint)
executeRoutes.post("/:path{.+}", async (c) => {
  try {
    const queryPath = c.req.param("path");

    // Get query content
    const queryContent = await queryManager.getQuery(queryPath);

    // Execute query
    const results = await queryExecutor.executeQuery(queryContent);

    return c.json({
      success: true,
      data: {
        query: queryPath,
        results,
        executedAt: new Date().toISOString(),
        resultCount: Array.isArray(results) ? results.length : 1,
      },
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Query execution failed",
        query: c.req.param("path"),
      },
      500
    );
  }
});
