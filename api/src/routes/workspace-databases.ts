import { Hono } from 'hono';
import { authMiddleware } from '../auth/auth.middleware';
import { requireWorkspace, requireWorkspaceRole, AuthenticatedContext } from '../middleware/workspace.middleware';
import { Database, IDatabase } from '../database/workspace-schema';
import { databaseConnectionService } from '../services/database-connection.service';
import { Types } from 'mongoose';

export const workspaceDatabaseRoutes = new Hono();

// Get all databases for workspace
workspaceDatabaseRoutes.get('/', authMiddleware, requireWorkspace, async (c: AuthenticatedContext) => {
  try {
    const workspace = c.get('workspace');
    
    const databases = await Database.find({
      workspaceId: workspace._id
    }).sort({ createdAt: -1 });

    return c.json({
      success: true,
      data: databases.map((db: IDatabase) => ({
        id: db._id,
        name: db.name,
        type: db.type,
        createdAt: db.createdAt,
        updatedAt: db.updatedAt,
        lastConnectedAt: db.lastConnectedAt,
      })),
    });
  } catch (error) {
    console.error('Error getting databases:', error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get databases',
      },
      500
    );
  }
});

// Get specific database
workspaceDatabaseRoutes.get('/:id', authMiddleware, requireWorkspace, async (c: AuthenticatedContext) => {
  try {
    const workspace = c.get('workspace');
    const databaseId = c.req.param('id');

    if (!Types.ObjectId.isValid(databaseId)) {
      return c.json(
        { success: false, error: 'Invalid database ID' },
        400
      );
    }

    const database = await Database.findOne({
      _id: new Types.ObjectId(databaseId),
      workspaceId: workspace._id,
    });

    if (!database) {
      return c.json(
        { success: false, error: 'Database not found' },
        404
      );
    }

    return c.json({
      success: true,
      data: {
        id: database._id,
        name: database.name,
        type: database.type,
        connection: database.connection, // Will be decrypted by getter
        createdAt: database.createdAt,
        updatedAt: database.updatedAt,
        lastConnectedAt: database.lastConnectedAt,
      },
    });
  } catch (error) {
    console.error('Error getting database:', error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get database',
      },
      500
    );
  }
});

// Create new database
workspaceDatabaseRoutes.post('/', authMiddleware, requireWorkspace, requireWorkspaceRole(['owner', 'admin', 'member']), async (c: AuthenticatedContext) => {
  try {
    const user = c.get('user');
    const workspace = c.get('workspace');
    const body = await c.req.json();

    // Validate required fields
    if (!body.name || !body.type) {
      return c.json(
        { success: false, error: 'Name and type are required' },
        400
      );
    }

    // Check workspace database limit
    const databaseCount = await Database.countDocuments({ workspaceId: workspace._id });
    if (databaseCount >= workspace.settings.maxDatabases) {
      return c.json(
        { success: false, error: `Workspace database limit reached (${workspace.settings.maxDatabases})` },
        403
      );
    }

    // Create database
    const database = new Database({
      workspaceId: workspace._id,
      name: body.name,
      type: body.type,
      connection: body.connection || {},
      createdBy: new Types.ObjectId(user!.id),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Test connection before saving
    const testResult = await databaseConnectionService.testConnection(database);
    if (!testResult.success) {
      return c.json(
        { success: false, error: `Connection test failed: ${testResult.error}` },
        400
      );
    }

    await database.save();

    return c.json(
      {
        success: true,
        data: {
          id: database._id,
          name: database.name,
          type: database.type,
          createdAt: database.createdAt,
        },
        message: 'Database created successfully',
      },
      201
    );
  } catch (error) {
    console.error('Error creating database:', error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create database',
      },
      500
    );
  }
});

// Update database
workspaceDatabaseRoutes.put('/:id', authMiddleware, requireWorkspace, requireWorkspaceRole(['owner', 'admin', 'member']), async (c: AuthenticatedContext) => {
  try {
    const workspace = c.get('workspace');
    const databaseId = c.req.param('id');
    const body = await c.req.json();

    if (!Types.ObjectId.isValid(databaseId)) {
      return c.json(
        { success: false, error: 'Invalid database ID' },
        400
      );
    }

    const database = await Database.findOne({
      _id: new Types.ObjectId(databaseId),
      workspaceId: workspace._id,
    });

    if (!database) {
      return c.json(
        { success: false, error: 'Database not found' },
        404
      );
    }

    // Update fields
    if (body.name) database.name = body.name;
    if (body.connection) {
      database.connection = { ...database.connection, ...body.connection };
      
      // Test new connection
      const testResult = await databaseConnectionService.testConnection(database);
      if (!testResult.success) {
        return c.json(
          { success: false, error: `Connection test failed: ${testResult.error}` },
          400
        );
      }
    }

    database.updatedAt = new Date();
    await database.save();

    return c.json({
      success: true,
      data: {
        id: database._id,
        name: database.name,
        type: database.type,
        updatedAt: database.updatedAt,
      },
      message: 'Database updated successfully',
    });
  } catch (error) {
    console.error('Error updating database:', error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update database',
      },
      500
    );
  }
});

// Delete database
workspaceDatabaseRoutes.delete('/:id', authMiddleware, requireWorkspace, requireWorkspaceRole(['owner', 'admin']), async (c: AuthenticatedContext) => {
  try {
    const workspace = c.get('workspace');
    const databaseId = c.req.param('id');

    if (!Types.ObjectId.isValid(databaseId)) {
      return c.json(
        { success: false, error: 'Invalid database ID' },
        400
      );
    }

    const result = await Database.deleteOne({
      _id: new Types.ObjectId(databaseId),
      workspaceId: workspace._id,
    });

    if (result.deletedCount === 0) {
      return c.json(
        { success: false, error: 'Database not found' },
        404
      );
    }

    // Close any open connections
    await databaseConnectionService.closeConnection(databaseId);

    return c.json({
      success: true,
      message: 'Database deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting database:', error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete database',
      },
      500
    );
  }
});

// Test database connection
workspaceDatabaseRoutes.post('/:id/test', authMiddleware, requireWorkspace, async (c: AuthenticatedContext) => {
  try {
    const workspace = c.get('workspace');
    const databaseId = c.req.param('id');

    if (!Types.ObjectId.isValid(databaseId)) {
      return c.json(
        { success: false, error: 'Invalid database ID' },
        400
      );
    }

    const database = await Database.findOne({
      _id: new Types.ObjectId(databaseId),
      workspaceId: workspace._id,
    });

    if (!database) {
      return c.json(
        { success: false, error: 'Database not found' },
        404
      );
    }

    const result = await databaseConnectionService.testConnection(database);

    if (result.success) {
      // Update last connected timestamp
      database.lastConnectedAt = new Date();
      await database.save();
    }

    return c.json(result);
  } catch (error) {
    console.error('Error testing database connection:', error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to test connection',
      },
      500
    );
  }
});

// Execute query on database
workspaceDatabaseRoutes.post('/:id/execute', authMiddleware, requireWorkspace, async (c: AuthenticatedContext) => {
  try {
    const workspace = c.get('workspace');
    const databaseId = c.req.param('id');
    const body = await c.req.json();

    if (!Types.ObjectId.isValid(databaseId)) {
      return c.json(
        { success: false, error: 'Invalid database ID' },
        400
      );
    }

    const database = await Database.findOne({
      _id: new Types.ObjectId(databaseId),
      workspaceId: workspace._id,
    });

    if (!database) {
      return c.json(
        { success: false, error: 'Database not found' },
        404
      );
    }

    if (!body.query) {
      return c.json(
        { success: false, error: 'Query is required' },
        400
      );
    }

    const result = await databaseConnectionService.executeQuery(
      database,
      body.query,
      body.options
    );

    return c.json(result);
  } catch (error) {
    console.error('Error executing query:', error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to execute query',
      },
      500
    );
  }
});

// Get collections for MongoDB database
workspaceDatabaseRoutes.get('/:id/collections', authMiddleware, requireWorkspace, async (c: AuthenticatedContext) => {
  try {
    const workspace = c.get('workspace');
    const databaseId = c.req.param('id');

    if (!Types.ObjectId.isValid(databaseId)) {
      return c.json(
        { success: false, error: 'Invalid database ID' },
        400
      );
    }

    const database = await Database.findOne({
      _id: new Types.ObjectId(databaseId),
      workspaceId: workspace._id,
    });

    if (!database) {
      return c.json(
        { success: false, error: 'Database not found' },
        404
      );
    }

    if (database.type !== 'mongodb') {
      return c.json(
        { success: false, error: 'This endpoint is only for MongoDB databases' },
        400
      );
    }

    const connection = await databaseConnectionService.getConnection(database);
    const db = connection.db(database.connection.database);
    const collections = await db.listCollections().toArray();

    return c.json({
      success: true,
      data: collections.map((col: any) => ({
        name: col.name,
        type: col.type,
        options: col.options,
      })),
    });
  } catch (error) {
    console.error('Error getting collections:', error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get collections',
      },
      500
    );
  }
});

// Get collection info for MongoDB
workspaceDatabaseRoutes.get('/:id/collections/:name', authMiddleware, requireWorkspace, async (c: AuthenticatedContext) => {
  try {
    const workspace = c.get('workspace');
    const databaseId = c.req.param('id');
    const collectionName = c.req.param('name');

    if (!Types.ObjectId.isValid(databaseId)) {
      return c.json(
        { success: false, error: 'Invalid database ID' },
        400
      );
    }

    const database = await Database.findOne({
      _id: new Types.ObjectId(databaseId),
      workspaceId: workspace._id,
    });

    if (!database) {
      return c.json(
        { success: false, error: 'Database not found' },
        404
      );
    }

    if (database.type !== 'mongodb') {
      return c.json(
        { success: false, error: 'This endpoint is only for MongoDB databases' },
        400
      );
    }

    const connection = await databaseConnectionService.getConnection(database);
    const db = connection.db(database.connection.database);
    
    // Check if collection exists
    const collections = await db.listCollections({ name: collectionName }).toArray();
    if (collections.length === 0) {
      return c.json(
        { success: false, error: `Collection '${collectionName}' not found` },
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
    console.error('Error getting collection info:', error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get collection info',
      },
      500
    );
  }
});