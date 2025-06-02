import { Hono } from "hono";
import { configLoader } from "../utils/config-loader";
import { mongoConnection } from "../utils/mongodb-connection";
import { Filter, FindOptions } from "mongodb";

export const databasesRoutes = new Hono();

// GET /api/databases/servers - List all MongoDB servers
databasesRoutes.get("/servers", async (c) => {
  try {
    // Get all MongoDB servers
    const servers = configLoader.getMongoServers();

    // Transform to API response format
    const serversData = servers.map((server) => ({
      id: server.id,
      name: server.name,
      description: server.description || "",
      connectionString: server.connection_string,
      active: server.active,
      databases: Object.entries(server.databases || {})
        .filter(([_, db]) => db.active)
        .map(([dbId, db]) => ({
          id: `${server.id}.${dbId}`,
          localId: dbId,
          name: db.name,
          description: db.description || "",
          database: db.database,
          active: db.active,
        })),
    }));

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

// GET /api/databases - List all MongoDB databases from config (backward compatibility)
databasesRoutes.get("/", async (c) => {
  try {
    // Get all MongoDB data sources
    const mongoSources = configLoader.getMongoDBSources();

    // Transform to API response format
    const databases = mongoSources.map((source) => ({
      id: source.id,
      name: source.name,
      description: source.description || "",
      database: source.database,
      active: source.active,
      serverId: source.serverId,
      serverName: source.serverName,
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

// GET /api/databases/:id/collections - List all collections in a database
databasesRoutes.get("/:id/collections", async (c) => {
  try {
    const databaseId = c.req.param("id");
    const db = await mongoConnection.getDatabase(databaseId);

    const collections = await db
      .listCollections({ type: "collection" })
      .toArray();

    return c.json({
      success: true,
      data: collections.map((col) => ({
        name: col.name,
        type: col.type,
        options: (col as any).options,
      })),
    });
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

// GET /api/databases/:id/views - List all views in a database
databasesRoutes.get("/:id/views", async (c) => {
  try {
    const databaseId = c.req.param("id");
    const db = await mongoConnection.getDatabase(databaseId);

    const views = await db.listCollections({ type: "view" }).toArray();

    return c.json({
      success: true,
      data: views.map((view) => ({
        name: view.name,
        type: view.type,
        options: (view as any).options,
      })),
    });
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

// GET /api/databases/:id/collections/:name - Get collection info
databasesRoutes.get("/:id/collections/:name", async (c) => {
  try {
    const databaseId = c.req.param("id");
    const collectionName = c.req.param("name");
    const db = await mongoConnection.getDatabase(databaseId);

    // Check if collection exists
    const collections = await db
      .listCollections({ name: collectionName })
      .toArray();

    if (collections.length === 0) {
      return c.json(
        {
          success: false,
          error: `Collection '${collectionName}' not found`,
        },
        404
      );
    }

    const collection = db.collection(collectionName);

    // Get collection stats
    const stats = await db.command({ collStats: collectionName });

    // Get indexes
    const indexes = await collection.indexes();

    return c.json({
      success: true,
      data: {
        name: collectionName,
        type: collections[0].type,
        stats: {
          count: stats.count,
          size: stats.size,
          avgObjSize: stats.avgObjSize,
          storageSize: stats.storageSize,
          indexes: stats.nindexes,
          totalIndexSize: stats.totalIndexSize,
        },
        indexes,
      },
    });
  } catch (error) {
    console.error("Error getting collection info:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

// GET /api/databases/:id/collections/:name/documents - Get documents from a collection
databasesRoutes.get("/:id/collections/:name/documents", async (c) => {
  try {
    const databaseId = c.req.param("id");
    const collectionName = c.req.param("name");
    const query = c.req.query();

    // Parse query parameters
    const limit = parseInt(query.limit || "10", 10);
    const skip = parseInt(query.skip || "0", 10);
    const sort = query.sort ? JSON.parse(query.sort) : {};
    const filter: Filter<any> = query.filter ? JSON.parse(query.filter) : {};

    // Validate parameters
    if (limit < 1 || limit > 1000) {
      return c.json(
        {
          success: false,
          error: "Limit must be between 1 and 1000",
        },
        400
      );
    }

    const db = await mongoConnection.getDatabase(databaseId);
    const collection = db.collection(collectionName);

    // Check if collection exists
    const collections = await db
      .listCollections({ name: collectionName })
      .toArray();

    if (collections.length === 0) {
      return c.json(
        {
          success: false,
          error: `Collection '${collectionName}' not found`,
        },
        404
      );
    }

    // Build find options
    const findOptions: FindOptions = {
      limit,
      skip,
      sort,
    };

    // Execute query
    const documents = await collection.find(filter, findOptions).toArray();

    // Get total count for pagination
    const totalCount = await collection.countDocuments(filter);

    return c.json({
      success: true,
      data: {
        documents,
        pagination: {
          limit,
          skip,
          total: totalCount,
          hasMore: skip + documents.length < totalCount,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching documents:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

// GET /api/databases/:id/collections/:name/sample - Get sample documents with schema analysis
databasesRoutes.get("/:id/collections/:name/sample", async (c) => {
  try {
    const databaseId = c.req.param("id");
    const collectionName = c.req.param("name");
    const query = c.req.query();
    const sampleSize = parseInt(query.size || "5", 10);

    if (sampleSize < 1 || sampleSize > 100) {
      return c.json(
        {
          success: false,
          error: "Sample size must be between 1 and 100",
        },
        400
      );
    }

    const db = await mongoConnection.getDatabase(databaseId);
    const collection = db.collection(collectionName);

    // Check if collection exists
    const collections = await db
      .listCollections({ name: collectionName })
      .toArray();

    if (collections.length === 0) {
      return c.json(
        {
          success: false,
          error: `Collection '${collectionName}' not found`,
        },
        404
      );
    }

    // Get sample documents
    const sampleDocuments = await collection
      .find({})
      .limit(sampleSize)
      .toArray();

    // Analyze schema
    const schemaInfo = analyzeSchema(sampleDocuments);

    return c.json({
      success: true,
      data: {
        databaseId,
        collectionName,
        sampleSize: sampleDocuments.length,
        documents: sampleDocuments,
        schema: schemaInfo,
      },
    });
  } catch (error) {
    console.error("Error fetching sample documents:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

// POST /api/databases/:id/collections - Create a new collection
databasesRoutes.post("/:id/collections", async (c) => {
  try {
    const databaseId = c.req.param("id");
    const body = await c.req.json();

    if (!body.name) {
      return c.json(
        { success: false, error: "Collection name is required" },
        400
      );
    }

    const db = await mongoConnection.getDatabase(databaseId);
    const result = await db.createCollection(body.name, body.options);

    return c.json({
      success: true,
      message: "Collection created successfully",
      data: {
        name: body.name,
        databaseId,
      },
    });
  } catch (error) {
    console.error("Error creating collection:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

// DELETE /api/databases/:id/collections/:name - Delete a collection
databasesRoutes.delete("/:id/collections/:name", async (c) => {
  try {
    const databaseId = c.req.param("id");
    const collectionName = c.req.param("name");

    const db = await mongoConnection.getDatabase(databaseId);
    const result = await db.dropCollection(collectionName);

    return c.json({
      success: true,
      message: "Collection deleted successfully",
      data: {
        name: collectionName,
        databaseId,
        dropped: result,
      },
    });
  } catch (error) {
    console.error("Error deleting collection:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

// Helper function to analyze schema from sample documents
function analyzeSchema(documents: any[]): any {
  if (!documents || documents.length === 0) return {};

  const schemaMap: any = {};

  const analyzeValue = (value: any): string => {
    if (value === null) return "null";
    if (Array.isArray(value)) {
      if (value.length > 0) {
        const types = new Set(value.map((v) => analyzeValue(v)));
        return `Array<${Array.from(types).join(" | ")}>`;
      }
      return "Array<any>";
    }
    if (value instanceof Date) return "Date";
    if (typeof value === "object") return "Object";
    return typeof value;
  };

  // Analyze each document
  documents.forEach((doc) => {
    Object.keys(doc).forEach((key) => {
      const value = doc[key];
      const type = analyzeValue(value);

      if (!schemaMap[key]) {
        schemaMap[key] = {
          types: new Set([type]),
          exampleValues: [],
        };
      } else {
        schemaMap[key].types.add(type);
      }

      // Store example values (limit to 3)
      if (
        schemaMap[key].exampleValues.length < 3 &&
        !schemaMap[key].exampleValues.some(
          (v: any) => JSON.stringify(v) === JSON.stringify(value)
        )
      ) {
        schemaMap[key].exampleValues.push(value);
      }
    });
  });

  // Convert sets to arrays for JSON serialization
  const schema: any = {};
  Object.keys(schemaMap).forEach((key) => {
    schema[key] = {
      types: Array.from(schemaMap[key].types),
      exampleValues: schemaMap[key].exampleValues,
    };
  });

  return schema;
}
