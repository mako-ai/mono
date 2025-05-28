import { Hono } from "hono";
import { QueryManager } from "../utils/query-manager";
import { QueryExecutor } from "../utils/query-executor";

export const executeRoutes = new Hono();
const queryManager = new QueryManager();
const queryExecutor = new QueryExecutor();

// POST /api/run/:path - Execute query and return results
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
