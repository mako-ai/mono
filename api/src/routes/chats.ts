import { Hono } from 'hono';
import { Chat, Workspace } from '../database/workspace-schema';
import { ObjectId } from 'mongodb';

export const chatsRoutes = new Hono();

// List chat sessions (most recent first)
chatsRoutes.get('/', async (c) => {
  try {
    const workspaceId = c.req.param('workspaceId');

    if (!ObjectId.isValid(workspaceId)) {
      return c.json({ error: 'Invalid workspace id' }, 400);
    }

    const chats = await Chat.find(
      { workspaceId: new ObjectId(workspaceId) },
      { messages: 0 },
    ).sort({ updatedAt: -1 });

    // Convert ObjectId to string for frontend convenience
    const mapped = chats.map((chat) => ({
      ...chat.toObject(),
      _id: chat._id.toString(),
    }));

    return c.json(mapped);
  } catch (error) {
    console.error('Error listing chats:', error);
    return c.json({ error: 'Failed to list chats' }, 500);
  }
});

// Create a new chat session
chatsRoutes.post('/', async (c) => {
  try {
    const workspaceId = c.req.param('workspaceId');

    if (!ObjectId.isValid(workspaceId)) {
      return c.json({ error: 'Invalid workspace id' }, 400);
    }

    let body: any = {};
    try {
      body = await c.req.json();
    } catch (_) {}

    const title = (body?.title as string) || 'New Chat';

    const now = new Date();
    const chat = new Chat({
      workspaceId: new ObjectId(workspaceId),
      title,
      messages: [],
      createdBy: 'system', // TODO: Get from auth context when available
      titleGenerated: false,
      createdAt: now,
      updatedAt: now,
    });

    await chat.save();

    return c.json({ chatId: chat._id.toString() });
  } catch (error) {
    console.error('Error creating chat:', error);
    return c.json({ error: 'Failed to create chat' }, 500);
  }
});

// Get a single chat session with messages
chatsRoutes.get('/:id', async (c) => {
  try {
    const workspaceId = c.req.param('workspaceId');
    const id = c.req.param('id');

    if (!ObjectId.isValid(workspaceId)) {
      return c.json({ error: 'Invalid workspace id' }, 400);
    }

    if (!ObjectId.isValid(id)) {
      return c.json({ error: 'Invalid chat id' }, 400);
    }

    const chat = await Chat.findOne({
      _id: new ObjectId(id),
      workspaceId: new ObjectId(workspaceId),
    });

    if (!chat) {
      return c.json({ error: 'Chat not found' }, 404);
    }

    return c.json({
      ...chat.toObject(),
      _id: chat._id.toString(),
    });
  } catch (error) {
    console.error('Error getting chat:', error);
    return c.json({ error: 'Failed to get chat' }, 500);
  }
});

// Update chat title (optional future use)
chatsRoutes.put('/:id', async (c) => {
  try {
    const workspaceId = c.req.param('workspaceId');
    const id = c.req.param('id');

    if (!ObjectId.isValid(workspaceId)) {
      return c.json({ error: 'Invalid workspace id' }, 400);
    }

    if (!ObjectId.isValid(id)) {
      return c.json({ error: 'Invalid chat id' }, 400);
    }

    let body: any = {};
    try {
      body = await c.req.json();
    } catch (_) {}

    const { title } = body;
    if (!title) {
      return c.json({ error: "'title' is required" }, 400);
    }

    const result = await Chat.findOneAndUpdate(
      { _id: new ObjectId(id), workspaceId: new ObjectId(workspaceId) },
      { title, updatedAt: new Date() },
      { new: true },
    );

    if (!result) {
      return c.json({ error: 'Chat not found' }, 404);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('Error updating chat:', error);
    return c.json({ error: 'Failed to update chat' }, 500);
  }
});

// Delete a chat session
chatsRoutes.delete('/:id', async (c) => {
  try {
    const workspaceId = c.req.param('workspaceId');
    const id = c.req.param('id');

    if (!ObjectId.isValid(workspaceId)) {
      return c.json({ error: 'Invalid workspace id' }, 400);
    }

    if (!ObjectId.isValid(id)) {
      return c.json({ error: 'Invalid chat id' }, 400);
    }

    const result = await Chat.findOneAndDelete({
      _id: new ObjectId(id),
      workspaceId: new ObjectId(workspaceId),
    });

    if (!result) {
      return c.json({ error: 'Chat not found' }, 404);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('Error deleting chat:', error);
    return c.json({ error: 'Failed to delete chat' }, 500);
  }
});
