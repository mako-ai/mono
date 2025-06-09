import { Hono } from "hono";
import { authMiddleware } from "../auth/auth.middleware";
import { requireWorkspace, AuthenticatedContext } from "../middleware/workspace.middleware";
import { Database } from "../database/workspace-schema";
import { databaseConnectionService } from "../services/database-connection.service";
import { Types } from "mongoose";

export const databasesRoutes = new Hono();

// GET /api/databases/servers - List all MongoDB servers (grouped by unique hosts)
// Note: This endpoint is deprecated, use /api/databases instead
databasesRoutes.get("/servers", authMiddleware, requireWorkspace, async (c: AuthenticatedContext) => {
  try {
    const workspace = c.get("workspace");
    
    // Get all MongoDB databases for the workspace
    const databases = await Database.find({
      workspaceId: workspace._id,
      type: "mongodb"
    }).sort({ name: 1 });

    // Group databases by their host to simulate "servers"
    // This is for backward compatibility with the UI
    const serverMap = new Map<string, any>();

    databases.forEach(db => {
      const conn = db.connection;
      // Use host or connection string as the key
      const serverKey = conn.connectionString || conn.host || "unknown";
      
      if (!serverMap.has(serverKey)) {
        serverMap.set(serverKey, {
          id: serverKey,
          name: conn.connectionString ? "MongoDB Atlas" : `MongoDB (${conn.host})`,
          description: "",
          connectionString: conn.connectionString || `mongodb://${conn.host}:${conn.port || 27017}`,
          active: true,
          databases: []
        });
      }

      const server = serverMap.get(serverKey);
      server.databases.push({
        id: db._id.toString(),
        localId: db._id.toString(),
        name: db.name,
        description: "",
        database: conn.database,
        active: true,
      });
    });

    // Convert map to array
    const serversData = Array.from(serverMap.values());

    return c.json({
      success: true,
      data: serversData,
    });
  } catch (error) {
    console.error("Error listing servers:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

// GET /api/databases - List all databases for the workspace
databasesRoutes.get("/", authMiddleware, requireWorkspace, async (c: AuthenticatedContext) => {
  try {
    const workspace = c.get("workspace");
    
    // Get all databases for the workspace
    const dbs = await Database.find({
      workspaceId: workspace._id
    }).sort({ name: 1 });

    // Transform to API response format
    const databases = dbs.map((db) => ({
      id: db._id.toString(),
      name: db.name,
      description: "",
      database: db.connection.database,
      type: db.type,
      active: true,
      lastConnectedAt: db.lastConnectedAt,
    }));

    return c.json({
      success: true,
      data: databases,
    });
  } catch (error) {
    console.error("Error listing databases:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

// GET /api/databases/:id/collections - List collections in a database
databasesRoutes.get("/:id/collections", authMiddleware, requireWorkspace, async (c: AuthenticatedContext) => {
  const databaseId = c.req.param("id");
  const workspace = c.get("workspace");

  try {
    // Validate database ID
    if (!Types.ObjectId.isValid(databaseId)) {
      return c.json({ success: false, error: "Invalid database ID" }, 400);
    }

    // Get the database from MongoDB
    const database = await Database.findOne({
      _id: new Types.ObjectId(databaseId),
      workspaceId: workspace._id
    });

    if (!database) {
      return c.json({ success: false, error: "Database not found" }, 404);
    }

    // Update last connected timestamp
    await Database.updateOne(
      { _id: database._id },
      { lastConnectedAt: new Date() }
    );

    // Get the actual database connection
    const connection = await databaseConnectionService.getConnection(database);

    if (!connection) {
      throw new Error("Failed to establish database connection");
    }

    // For MongoDB, get collections
    if (database.type === "mongodb") {
      const db = connection.db(database.connection.database);
      const collections = await db.listCollections().toArray();

      const collectionDetails = await Promise.all(
        collections.map(async (collection: any) => {
          try {
            // Get additional collection info if needed
            const stats = await db.collection(collection.name).stats().catch(() => null);
            
            return {
              name: collection.name,
              type: collection.type || "collection",
              options: collection.options || {},
              size: stats?.size,
              count: stats?.count,
            };
          } catch (error) {
            // If stats fail, just return basic info
            return {
              name: collection.name,
              type: collection.type || "collection",
              options: collection.options || {},
            };
          }
        })
      );

      return c.json({
        success: true,
        data: collectionDetails,
      });
    } else {
      // For SQL databases, would return tables instead
      return c.json({
        success: false,
        error: "Collection listing not implemented for non-MongoDB databases",
      });
    }
  } catch (error) {
    console.error("Error listing collections:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

// GET /api/databases/:id/views - List views in a database  
databasesRoutes.get("/:id/views", authMiddleware, requireWorkspace, async (c: AuthenticatedContext) => {
  const databaseId = c.req.param("id");
  const workspace = c.get("workspace");

  try {
    // Validate database ID
    if (!Types.ObjectId.isValid(databaseId)) {
      return c.json({ success: false, error: "Invalid database ID" }, 400);
    }

    // Get the database from MongoDB
    const database = await Database.findOne({
      _id: new Types.ObjectId(databaseId),
      workspaceId: workspace._id
    });

    if (!database) {
      return c.json({ success: false, error: "Database not found" }, 404);
    }

    // Get the actual database connection
    const connection = await databaseConnectionService.getConnection(database);

    if (!connection) {
      throw new Error("Failed to establish database connection");
    }

    // For MongoDB, get views
    if (database.type === "mongodb") {
      const db = connection.db(database.connection.database);
      const collections = await db.listCollections({ type: "view" }).toArray();

      const viewDetails = collections.map((view: any) => ({
        name: view.name,
        type: "view",
        options: view.options || {},
      }));

      return c.json({
        success: true,
        data: viewDetails,
      });
    } else {
      // For SQL databases, would return views differently
      return c.json({
        success: false,
        error: "View listing not implemented for non-MongoDB databases",
      });
    }
  } catch (error) {
    console.error("Error listing views:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

// POST /api/databases/:id/test - Test database connection
databasesRoutes.post("/:id/test", authMiddleware, requireWorkspace, async (c: AuthenticatedContext) => {
  const databaseId = c.req.param("id");
  const workspace = c.get("workspace");

  try {
    // Validate database ID
    if (!Types.ObjectId.isValid(databaseId)) {
      return c.json({ success: false, error: "Invalid database ID" }, 400);
    }

    // Get the database from MongoDB
    const database = await Database.findOne({
      _id: new Types.ObjectId(databaseId),
      workspaceId: workspace._id
    });

    if (!database) {
      return c.json({ success: false, error: "Database not found" }, 404);
    }

    // Test the connection
    const result = await databaseConnectionService.testConnection(database);

    // Update last connected timestamp if successful
    if (result.success) {
      await Database.updateOne(
        { _id: database._id },
        { lastConnectedAt: new Date() }
      );
    }

    return c.json(result);
  } catch (error) {
    console.error("Error testing database connection:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

// POST /api/databases/:id/query - Execute a query on the database
databasesRoutes.post("/:id/query", authMiddleware, requireWorkspace, async (c: AuthenticatedContext) => {
  const databaseId = c.req.param("id");
  const workspace = c.get("workspace");

  try {
    // Validate database ID
    if (!Types.ObjectId.isValid(databaseId)) {
      return c.json({ success: false, error: "Invalid database ID" }, 400);
    }

    // Get the database from MongoDB
    const database = await Database.findOne({
      _id: new Types.ObjectId(databaseId),
      workspaceId: workspace._id
    });

    if (!database) {
      return c.json({ success: false, error: "Database not found" }, 404);
    }

    const body = await c.req.json();
    const { query, options } = body;

    if (!query) {
      return c.json({ success: false, error: "Query is required" }, 400);
    }

    // Execute the query
    const result = await databaseConnectionService.executeQuery(database, query, options);

    // Update last connected timestamp if successful
    if (result.success) {
      await Database.updateOne(
        { _id: database._id },
        { lastConnectedAt: new Date() }
      );
    }

    return c.json(result);
  } catch (error) {
    console.error("Error executing query:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});
