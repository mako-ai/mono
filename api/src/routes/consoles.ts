import { Hono } from "hono";
import { ConsoleManager } from "../utils/console-manager";

export const consoleRoutes = new Hono();
const consoleManager = new ConsoleManager();

// GET /api/consoles - List all consoles (tree structure)
consoleRoutes.get("/", async (c) => {
  try {
    const tree = await consoleManager.listConsoles();
    // Log the tree structure just before sending it
    console.log("Tree data in route handler (before c.json):");
    if (tree.length > 0) {
      tree.slice(0, 3).forEach((entry) => {
        console.log(
          `  Path: ${entry.path}, Name: ${entry.name}, isDirectory: ${entry.isDirectory}, Children count: ${entry.children ? entry.children.length : 0}`
        );
        if (entry.children && entry.children.length > 0) {
          console.log(
            `    Child of ${entry.name} - Path: ${entry.children[0].path}, isDirectory: ${entry.children[0].isDirectory}`
          );
        }
      });
    }
    return c.json({ success: true, tree });
  } catch (error) {
    console.error("Error listing consoles:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

// GET /api/consoles/content - Get specific console content
// Changed from /api/consoles/:path to /api/consoles/content?path=...
// to match the new frontend ConsoleExplorer structure
consoleRoutes.get("/content", async (c) => {
  try {
    const consolePath = c.req.query("path");
    if (!consolePath) {
      return c.json(
        { success: false, error: "Path query parameter is required" },
        400
      );
    }
    const content = await consoleManager.getConsole(consolePath);
    return c.json({ success: true, content }); // Return just content, path is known
  } catch (error) {
    console.error(
      `Error fetching console content for ${c.req.query("path")}:`,
      error
    );
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Console not found",
      },
      404
    );
  }
});

// POST /api/consoles - Create new console
// The path will be part of the request body, e.g., { path: "folder/newConsole", content: "..." }
consoleRoutes.post("/", async (c) => {
  try {
    const body = await c.req.json();
    const { path: consolePath, content } = body;

    if (!consolePath || typeof consolePath !== "string") {
      return c.json(
        { success: false, error: "Path is required and must be a string" },
        400
      );
    }
    if (typeof content !== "string") {
      // Allow empty content
      return c.json({ success: false, error: "Content must be a string" }, 400);
    }

    const exists = await consoleManager.consoleExists(consolePath);
    if (exists) {
      return c.json(
        { success: false, error: "Console already exists at this path" },
        409
      );
    }

    await consoleManager.saveConsole(consolePath, content);
    // Return the created console's details, could be useful for the client
    return c.json(
      {
        success: true,
        message: "Console created successfully",
        data: { path: consolePath, content },
      },
      201
    );
  } catch (error) {
    console.error("Error creating console:", error);
    return c.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error creating console",
      },
      500
    );
  }
});

// PUT /api/consoles/:path - Update existing console
// The path is still in the URL, content in the body
consoleRoutes.put("/:path{.+}", async (c) => {
  try {
    const consolePath = c.req.param("path");
    const body = await c.req.json();

    if (typeof body.content !== "string") {
      return c.json(
        { success: false, error: "Content is required and must be a string" },
        400
      );
    }

    // Optional: Check if console exists before attempting to save, though saveConsole should handle it by creating if not present.
    // For a strict update, you might want to check and return 404 if it doesn't exist.
    // const exists = await consoleManager.consoleExists(consolePath);
    // if (!exists) {
    //   return c.json({ success: false, error: "Console not found" }, 404);
    // }

    await consoleManager.saveConsole(consolePath, body.content);
    return c.json({
      success: true,
      message: "Console updated successfully",
      data: { path: consolePath, content: body.content },
    });
  } catch (error) {
    console.error(`Error updating console ${c.req.param("path")}:`, error);
    return c.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error updating console",
      },
      500
    );
  }
});

// DELETE /api/consoles/:path - Delete a console
// (Placeholder, as delete functionality was not explicitly in queryManager but is good for CRUD)
// consoleRoutes.delete("/:path{.+}", async (c) => {
//   try {
//     const consolePath = c.req.param("path");
//     // Add consoleManager.deleteConsole(consolePath) method
//     // await consoleManager.deleteConsole(consolePath);
//     return c.json({ success: true, message: "Console deleted successfully" });
//   } catch (error) {
//     console.error(`Error deleting console ${c.req.param("path")}:`, error);
//     return c.json(
//       {
//         success: false,
//         error: error instanceof Error ? error.message : "Unknown error deleting console",
//       },
//       500
//     );
//   }
// });
