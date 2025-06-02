import { Hono } from "hono";
import { ConsoleManager } from "../utils/console-manager";
import { QueryExecutor } from "../utils/query-executor";

export const executeRoutes = new Hono();
const consoleManager = new ConsoleManager();
const queryExecutor = new QueryExecutor();

// POST /api/execute - Execute console content directly from request body
executeRoutes.post("/", async (c) => {
  try {
    const body = await c.req.json();

    if (!body.content) {
      return c.json(
        {
          success: false,
          error: "Console content is required in request body",
        },
        400
      );
    }

    // Execute console content directly with optional database ID
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
          error instanceof Error ? error.message : "Console execution failed",
      },
      500
    );
  }
});

// POST /api/run/:path - Execute console and return results (legacy endpoint)
executeRoutes.post("/:path{.+}", async (c) => {
  try {
    const consolePath = c.req.param("path");

    // Get console content
    const consoleContent = await consoleManager.getConsole(consolePath);

    // Execute console
    const results = await queryExecutor.executeQuery(consoleContent);

    return c.json({
      success: true,
      data: {
        console: consolePath,
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
          error instanceof Error ? error.message : "Console execution failed",
        console: c.req.param("path"),
      },
      500
    );
  }
});
