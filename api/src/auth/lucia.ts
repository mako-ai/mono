import { Lucia, TimeSpan } from "lucia";
import { MongoDBAdapter } from "./mongodb-adapter";

/**
 * Lucia authentication instance configuration
 */
export const lucia = new Lucia(new MongoDBAdapter(), {
  sessionCookie: {
    attributes: {
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    },
  },
  sessionExpiresIn: new TimeSpan(24, "h"), // 24 hours
  getUserAttributes: (attributes) => {
    return {
      email: attributes.email,
    };
  },
  getSessionAttributes: (attributes) => {
    return {
      activeWorkspaceId: attributes.activeWorkspaceId,
    };
  },
});

/**
 * Type declarations for Lucia
 */
declare module "lucia" {
  interface Register {
    Lucia: typeof lucia;
    DatabaseUserAttributes: DatabaseUserAttributes;
    DatabaseSessionAttributes: DatabaseSessionAttributes;
  }
}

/**
 * User attributes stored in the database
 */
interface DatabaseUserAttributes {
  email: string;
}

/**
 * Session attributes stored in the database
 */
interface DatabaseSessionAttributes {
  activeWorkspaceId?: string;
}
