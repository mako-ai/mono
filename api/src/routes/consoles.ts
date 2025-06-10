import { Hono, Context } from 'hono';
import { ConsoleManager } from '../utils/console-manager';
import { authMiddleware } from '../auth/auth.middleware';
import { Database } from '../database/workspace-schema';
import { workspaceService } from '../services/workspace.service';

export const consoleRoutes = new Hono();
const consoleManager = new ConsoleManager();

// Apply auth middleware to all console routes
consoleRoutes.use('*', authMiddleware);

// GET /api/workspaces/:workspaceId/consoles - List all consoles (tree structure) for workspace
consoleRoutes.get('/', async (c: Context) => {
  try {
    const workspaceId = c.req.param('workspaceId');
    const user = c.get('user');

    // Verify user has access to workspace
    if (!user || !(await workspaceService.hasAccess(workspaceId, user.id))) {
      return c.json(
        { success: false, error: 'Access denied to workspace' },
        403,
      );
    }

    const tree = await consoleManager.listConsoles(workspaceId);

    return c.json({ success: true, tree });
  } catch (error) {
    console.error('Error listing consoles:', error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      500,
    );
  }
});

// GET /api/workspaces/:workspaceId/consoles/content - Get specific console content
consoleRoutes.get('/content', async (c: Context) => {
  try {
    const workspaceId = c.req.param('workspaceId');
    const consolePath = c.req.query('path');
    const user = c.get('user');

    // Verify user has access to workspace
    if (!user || !(await workspaceService.hasAccess(workspaceId, user.id))) {
      return c.json(
        { success: false, error: 'Access denied to workspace' },
        403,
      );
    }

    if (!consolePath) {
      return c.json(
        { success: false, error: 'Path query parameter is required' },
        400,
      );
    }

    const content = await consoleManager.getConsole(consolePath, workspaceId);
    return c.json({ success: true, content });
  } catch (error) {
    console.error(
      `Error fetching console content for ${c.req.query('path')}:`,
      error,
    );
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Console not found',
      },
      404,
    );
  }
});

// POST /api/workspaces/:workspaceId/consoles - Create new console
consoleRoutes.post('/', async (c: Context) => {
  try {
    const workspaceId = c.req.param('workspaceId');
    const body = await c.req.json();
    const {
      path: consolePath,
      content,
      databaseId,
      folderId,
      description,
      language,
      isPrivate,
    } = body;
    const user = c.get('user');

    // Verify user has access to workspace
    if (!user || !(await workspaceService.hasAccess(workspaceId, user.id))) {
      return c.json(
        { success: false, error: 'Access denied to workspace' },
        403,
      );
    }

    if (!consolePath || typeof consolePath !== 'string') {
      return c.json(
        { success: false, error: 'Path is required and must be a string' },
        400,
      );
    }
    if (typeof content !== 'string') {
      return c.json({ success: false, error: 'Content must be a string' }, 400);
    }

    // databaseId is optional - consoles can be saved without being associated with a specific database
    let targetDatabaseId = databaseId;
    if (!targetDatabaseId) {
      // Try to get the first database for the workspace, but don't require it
      const databases = await Database.find({ workspaceId }).limit(1);
      if (databases.length > 0) {
        targetDatabaseId = databases[0]._id.toString();
      }
      // If no databases exist, that's fine - targetDatabaseId will remain undefined
    }

    const exists = await consoleManager.consoleExists(consolePath, workspaceId);
    if (exists) {
      return c.json(
        { success: false, error: 'Console already exists at this path' },
        409,
      );
    }

    const savedConsole = await consoleManager.saveConsole(
      consolePath,
      content,
      workspaceId,
      user.id,
      targetDatabaseId,
      {
        folderId,
        description,
        language,
        isPrivate,
      },
    );

    return c.json(
      {
        success: true,
        message: 'Console created successfully',
        data: {
          id: savedConsole._id.toString(),
          path: consolePath,
          content,
          databaseId: targetDatabaseId,
          language: savedConsole.language,
        },
      },
      201,
    );
  } catch (error) {
    console.error('Error creating console:', error);
    return c.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown error creating console',
      },
      500,
    );
  }
});

// PUT /api/workspaces/:workspaceId/consoles/:path - Update existing console
consoleRoutes.put('/:path{.+}', async (c: Context) => {
  try {
    const workspaceId = c.req.param('workspaceId');
    const consolePath = c.req.param('path');
    const body = await c.req.json();
    const user = c.get('user');

    // Verify user has access to workspace
    if (!user || !(await workspaceService.hasAccess(workspaceId, user.id))) {
      return c.json(
        { success: false, error: 'Access denied to workspace' },
        403,
      );
    }

    if (typeof body.content !== 'string') {
      return c.json(
        { success: false, error: 'Content is required and must be a string' },
        400,
      );
    }

    // databaseId is optional - consoles can be saved without being associated with a specific database
    let targetDatabaseId = body.databaseId;
    if (!targetDatabaseId) {
      // Try to get the first database for the workspace, but don't require it
      const databases = await Database.find({ workspaceId }).limit(1);
      if (databases.length > 0) {
        targetDatabaseId = databases[0]._id.toString();
      }
      // If no databases exist, that's fine - targetDatabaseId will remain undefined
    }

    const savedConsole = await consoleManager.saveConsole(
      consolePath,
      body.content,
      workspaceId,
      user.id,
      targetDatabaseId,
      {
        folderId: body.folderId,
        description: body.description,
        language: body.language,
        isPrivate: body.isPrivate,
      },
    );

    return c.json({
      success: true,
      message: 'Console updated successfully',
      data: {
        id: savedConsole._id.toString(),
        path: consolePath,
        content: body.content,
        databaseId: targetDatabaseId,
        language: savedConsole.language,
      },
    });
  } catch (error) {
    console.error(`Error updating console ${c.req.param('path')}:`, error);
    return c.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown error updating console',
      },
      500,
    );
  }
});

// POST /api/workspaces/:workspaceId/consoles/folders - Create new folder
consoleRoutes.post('/folders', async (c: Context) => {
  try {
    const workspaceId = c.req.param('workspaceId');
    const body = await c.req.json();
    const { name, parentId, isPrivate } = body;
    const user = c.get('user');

    // Verify user has access to workspace
    if (!user || !(await workspaceService.hasAccess(workspaceId, user.id))) {
      return c.json(
        { success: false, error: 'Access denied to workspace' },
        403,
      );
    }

    if (!name || typeof name !== 'string') {
      return c.json(
        { success: false, error: 'Name is required and must be a string' },
        400,
      );
    }

    const folder = await consoleManager.createFolder(
      name,
      workspaceId,
      user.id,
      parentId,
      isPrivate || false,
    );

    return c.json(
      {
        success: true,
        message: 'Folder created successfully',
        data: {
          id: folder._id.toString(),
          name: folder.name,
          parentId: folder.parentId?.toString(),
          isPrivate: folder.isPrivate,
        },
      },
      201,
    );
  } catch (error) {
    console.error('Error creating folder:', error);
    return c.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown error creating folder',
      },
      500,
    );
  }
});

// PATCH /api/workspaces/:workspaceId/consoles/:id/rename - Rename a console
consoleRoutes.patch('/:id/rename', async (c: Context) => {
  try {
    const workspaceId = c.req.param('workspaceId');
    const consoleId = c.req.param('id');
    const body = await c.req.json();
    const { name } = body;
    const user = c.get('user');

    // Verify user has access to workspace
    if (!user || !(await workspaceService.hasAccess(workspaceId, user.id))) {
      return c.json(
        { success: false, error: 'Access denied to workspace' },
        403,
      );
    }

    if (!name || typeof name !== 'string') {
      return c.json(
        { success: false, error: 'Name is required and must be a string' },
        400,
      );
    }

    const success = await consoleManager.renameConsole(
      consoleId,
      name,
      workspaceId,
      user.id,
    );

    if (success) {
      return c.json({ success: true, message: 'Console renamed successfully' });
    } else {
      return c.json({ success: false, error: 'Console not found' }, 404);
    }
  } catch (error) {
    console.error(`Error renaming console ${c.req.param('id')}:`, error);
    return c.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown error renaming console',
      },
      500,
    );
  }
});

// DELETE /api/workspaces/:workspaceId/consoles/:id - Delete a console
consoleRoutes.delete('/:id', async (c: Context) => {
  try {
    const workspaceId = c.req.param('workspaceId');
    const consoleId = c.req.param('id');
    const user = c.get('user');

    // Verify user has access to workspace
    if (!user || !(await workspaceService.hasAccess(workspaceId, user.id))) {
      return c.json(
        { success: false, error: 'Access denied to workspace' },
        403,
      );
    }

    const success = await consoleManager.deleteConsole(consoleId, workspaceId);

    if (success) {
      return c.json({ success: true, message: 'Console deleted successfully' });
    } else {
      return c.json({ success: false, error: 'Console not found' }, 404);
    }
  } catch (error) {
    console.error(`Error deleting console ${c.req.param('id')}:`, error);
    return c.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown error deleting console',
      },
      500,
    );
  }
});

// PATCH /api/workspaces/:workspaceId/consoles/folders/:id/rename - Rename a folder
consoleRoutes.patch('/folders/:id/rename', async (c: Context) => {
  try {
    const workspaceId = c.req.param('workspaceId');
    const folderId = c.req.param('id');
    const body = await c.req.json();
    const { name } = body;
    const user = c.get('user');

    // Verify user has access to workspace
    if (!user || !(await workspaceService.hasAccess(workspaceId, user.id))) {
      return c.json(
        { success: false, error: 'Access denied to workspace' },
        403,
      );
    }

    if (!name || typeof name !== 'string') {
      return c.json(
        { success: false, error: 'Name is required and must be a string' },
        400,
      );
    }

    const success = await consoleManager.renameFolder(
      folderId,
      name,
      workspaceId,
    );

    if (success) {
      return c.json({ success: true, message: 'Folder renamed successfully' });
    } else {
      return c.json({ success: false, error: 'Folder not found' }, 404);
    }
  } catch (error) {
    console.error(`Error renaming folder ${c.req.param('id')}:`, error);
    return c.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown error renaming folder',
      },
      500,
    );
  }
});

// DELETE /api/workspaces/:workspaceId/consoles/folders/:id - Delete a folder
consoleRoutes.delete('/folders/:id', async (c: Context) => {
  try {
    const workspaceId = c.req.param('workspaceId');
    const folderId = c.req.param('id');
    const user = c.get('user');

    // Verify user has access to workspace
    if (!user || !(await workspaceService.hasAccess(workspaceId, user.id))) {
      return c.json(
        { success: false, error: 'Access denied to workspace' },
        403,
      );
    }

    const success = await consoleManager.deleteFolder(folderId, workspaceId);

    if (success) {
      return c.json({ success: true, message: 'Folder deleted successfully' });
    } else {
      return c.json({ success: false, error: 'Folder not found' }, 404);
    }
  } catch (error) {
    console.error(`Error deleting folder ${c.req.param('id')}:`, error);
    return c.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown error deleting folder',
      },
      500,
    );
  }
});

// POST /api/workspaces/:workspaceId/consoles/:id/execute - Update execution stats when console is executed
consoleRoutes.post('/:id/execute', async (c: Context) => {
  try {
    const workspaceId = c.req.param('workspaceId');
    const consoleId = c.req.param('id');
    const user = c.get('user');

    // Verify user has access to workspace
    if (!user || !(await workspaceService.hasAccess(workspaceId, user.id))) {
      return c.json(
        { success: false, error: 'Access denied to workspace' },
        403,
      );
    }

    await consoleManager.updateExecutionStats(consoleId, workspaceId);

    return c.json({ success: true, message: 'Execution stats updated' });
  } catch (error) {
    console.error(
      `Error updating execution stats for console ${c.req.param('id')}:`,
      error,
    );
    return c.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown error updating execution stats',
      },
      500,
    );
  }
});
