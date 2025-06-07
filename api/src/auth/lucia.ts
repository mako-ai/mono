import { Lucia } from 'lucia';
import { MongoDBAdapter } from './mongodb-adapter';

/**
 * Lucia authentication instance configuration
 */
export const lucia = new Lucia(new MongoDBAdapter(), {
  sessionCookie: {
    attributes: {
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    },
  },
  sessionExpiresIn: {
    activePeriod: parseInt(process.env.SESSION_DURATION || '86400000'), // 24 hours
    idlePeriod: 1000 * 60 * 60 * 24 * 7, // 7 days
  },
});

/**
 * Type declarations for Lucia
 */
declare module 'lucia' {
  interface Register {
    Lucia: typeof lucia;
    DatabaseUserAttributes: DatabaseUserAttributes;
  }
}

/**
 * User attributes stored in the database
 */
interface DatabaseUserAttributes {
  email: string;
}