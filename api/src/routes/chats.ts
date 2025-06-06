import { Hono } from "hono";
import { mongoConnection } from "../utils/mongodb-connection";
import { ObjectId } from "mongodb";

export const chatsRoutes = new Hono();

// Helper to get the chats collection from the default analytics database
const getChatsCollection = async () => {
  const db = await mongoConnection.getDb();
  return db.collection("chats");
};

// List chat sessions (most recent first)
chatsRoutes.get("/", async (c) => {
  const collection = await getChatsCollection();
  const chats = await collection
    .find({}, { projection: { messages: 0 } })
    .sort({ updatedAt: -1 })
    .toArray();

  // Convert ObjectId to string for frontend convenience
  const mapped = chats.map((chat) => ({
    ...chat,
    _id: (chat._id as any)?.toString(),
  }));

  return c.json(mapped);
});

// Create a new chat session
chatsRoutes.post("/", async (c) => {
  let body: any = {};
  try {
    body = await c.req.json();
  } catch (_) {}

  const title = (body?.title as string) || "New Chat";

  const collection = await getChatsCollection();
  const now = new Date();
  const result = await collection.insertOne({
    title,
    messages: [],
    createdAt: now,
    updatedAt: now,
  });

  return c.json({ chatId: result.insertedId.toString() });
});

// Get a single chat session with messages
chatsRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const collection = await getChatsCollection();

  try {
    const chat = await collection.findOne({ _id: new ObjectId(id) });
    if (!chat) {
      return c.json({ error: "Chat not found" }, 404);
    }
    return c.json({
      ...chat,
      _id: (chat._id as any)?.toString(),
    });
  } catch (err) {
    return c.json({ error: "Invalid chat id" }, 400);
  }
});

// Update chat title (optional future use)
chatsRoutes.put("/:id", async (c) => {
  const id = c.req.param("id");
  let body: any = {};
  try {
    body = await c.req.json();
  } catch (_) {}

  const { title } = body;
  if (!title) {
    return c.json({ error: "'title' is required" }, 400);
  }

  const collection = await getChatsCollection();
  try {
    const result = await collection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { title, updatedAt: new Date() } }
    );
    if (result.matchedCount === 0) {
      return c.json({ error: "Chat not found" }, 404);
    }
    return c.json({ success: true });
  } catch (err) {
    return c.json({ error: "Invalid chat id" }, 400);
  }
});

// Delete a chat session
chatsRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const collection = await getChatsCollection();

  try {
    const result = await collection.deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) {
      return c.json({ error: "Chat not found" }, 404);
    }
    return c.json({ success: true });
  } catch (err) {
    return c.json({ error: "Invalid chat id" }, 400);
  }
});
