import type { Adapter, DatabaseSession, DatabaseUser } from 'lucia';
import { Session, User } from '../database/schema';

/**
 * MongoDB adapter for Lucia authentication
 */
export class MongoDBAdapter implements Adapter {
  /**
   * Get session and associated user
   */
  async getSessionAndUser(
    sessionId: string,
  ): Promise<[session: DatabaseSession | null, user: DatabaseUser | null]> {
    const session = await Session.findById(sessionId).lean();
    if (!session) {
      return [null, null];
    }

    const user = await User.findById(session.userId).lean();
    if (!user) {
      return [null, null];
    }

    return [
      {
        id: session._id,
        userId: session.userId,
        expiresAt: session.expiresAt,
        attributes: {
          activeWorkspaceId: session.activeWorkspaceId,
        },
      },
      {
        id: user._id,
        attributes: {
          email: user.email,
        },
      },
    ];
  }

  /**
   * Get all sessions for a user
   */
  async getUserSessions(userId: string): Promise<DatabaseSession[]> {
    const sessions = await Session.find({ userId }).lean();
    return sessions.map((session) => ({
      id: session._id,
      userId: session.userId,
      expiresAt: session.expiresAt,
      attributes: {
        activeWorkspaceId: session.activeWorkspaceId,
      },
    }));
  }

  /**
   * Create a new session
   */
  async setSession(session: DatabaseSession): Promise<void> {
    await Session.create({
      _id: session.id,
      userId: session.userId,
      expiresAt: session.expiresAt,
      activeWorkspaceId: session.attributes?.activeWorkspaceId,
    });
  }

  /**
   * Update session expiration
   */
  async updateSessionExpiration(sessionId: string, expiresAt: Date): Promise<void> {
    await Session.updateOne({ _id: sessionId }, { expiresAt });
  }

  /**
   * Delete session
   */
  async deleteSession(sessionId: string): Promise<void> {
    await Session.deleteOne({ _id: sessionId });
  }

  /**
   * Delete all sessions for a user
   */
  async deleteUserSessions(userId: string): Promise<void> {
    await Session.deleteMany({ userId });
  }

  /**
   * Delete expired sessions
   */
  async deleteExpiredSessions(): Promise<void> {
    await Session.deleteMany({
      expiresAt: {
        $lte: new Date(),
      },
    });
  }
}