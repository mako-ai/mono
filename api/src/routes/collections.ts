import { Hono } from "hono";
import { mongoConnection } from "../utils/mongodb-connection";
import { Filter, FindOptions } from "mongodb";

export const collectionsRoutes = new Hono();

// GET /api/collections - List all collections
collectionsRoutes.get("/", async (c) => {
  try {
    const db = await mongoConnection.getDb();
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

// GET /api/collections/:name - Get collection info
collectionsRoutes.get("/:name", async (c) => {
  try {
    const collectionName = c.req.param("name");
    const db = await mongoConnection.getDb();

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

// GET /api/collections/:name/documents - Get documents from a collection
collectionsRoutes.get("/:name/documents", async (c) => {
  try {
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

    const db = await mongoConnection.getDb();
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

// GET /api/collections/:name/sample - Get sample documents with schema analysis
collectionsRoutes.get("/:name/sample", async (c) => {
  try {
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

    const db = await mongoConnection.getDb();
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
