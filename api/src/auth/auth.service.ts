import bcrypt from 'bcrypt';
import { generateId } from 'lucia';
import { lucia } from './lucia';
import { User, OAuthAccount } from '../database/schema';
import type { OAuthProvider } from './arctic';
import { workspaceService } from '../services/workspace.service';

/**
 * Authentication service with business logic
 */
export class AuthService {
  /**
   * Register a new user with email and password
   */
  async register(email: string, password: string) {
    // Validate input
    if (!email || !password) {
      throw new Error('Email and password are required');
    }

    if (password.length < 8) {
      throw new Error('Password must be at least 8 characters long');
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    // Hash password
    const rounds = parseInt(process.env.BCRYPT_ROUNDS || '10');
    const hashedPassword = await bcrypt.hash(password, rounds);

    // Create user
    const userId = generateId(15);
    const user = await User.create({
      _id: userId,
      email: email.toLowerCase(),
      hashedPassword,
    });

    // Create default workspace for the user
    const workspace = await workspaceService.createWorkspace(
      userId,
      `${email}'s Workspace`,
    );

    // Create session with workspace
    const session = await lucia.createSession(userId, {
      activeWorkspaceId: workspace._id.toString(),
    });
    
    return { user, session };
  }

  /**
   * Login user with email and password
   */
  async login(email: string, password: string) {
    // Validate input
    if (!email || !password) {
      throw new Error('Email and password are required');
    }

    // Find user
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      throw new Error('Invalid email or password');
    }

    // Check if user has password (not OAuth only)
    if (!user.hashedPassword) {
      throw new Error('Please login with your OAuth provider');
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.hashedPassword);
    if (!validPassword) {
      throw new Error('Invalid email or password');
    }

    // Get user's workspaces
    const workspaces = await workspaceService.getWorkspacesForUser(user._id);
    const activeWorkspaceId = workspaces.length > 0 ? workspaces[0].workspace._id.toString() : undefined;

    // Create session
    const session = await lucia.createSession(user._id, {
      activeWorkspaceId,
    });
    
    return { user, session };
  }

  /**
   * Handle OAuth callback and create/login user
   */
  async handleOAuthCallback(
    provider: OAuthProvider,
    providerUserId: string,
    email?: string,
  ) {
    // Check if OAuth account exists
    const existingAccount = await OAuthAccount.findOne({
      provider,
      providerUserId,
    });

    if (existingAccount) {
      // User exists, create session
      const user = await User.findById(existingAccount.userId);
      if (!user) {
        throw new Error('User account not found');
      }

      // Get user's workspaces
      const workspaces = await workspaceService.getWorkspacesForUser(user._id);
      const activeWorkspaceId = workspaces.length > 0 ? workspaces[0].workspace._id.toString() : undefined;

      const session = await lucia.createSession(user._id, {
        activeWorkspaceId,
      });
      return { user, session, isNewUser: false };
    }

    // New OAuth account
    let user;
    
    if (email) {
      // Check if user with this email exists
      user = await User.findOne({ email: email.toLowerCase() });
      
      if (!user) {
        // Create new user
        const userId = generateId(15);
        user = await User.create({
          _id: userId,
          email: email.toLowerCase(),
        });
      }
    } else {
      // Create user without email (GitHub might not provide email)
      const userId = generateId(15);
      user = await User.create({
        _id: userId,
        email: `${provider}_${providerUserId}@oauth.local`,
      });
    }

    // Create OAuth account link
    await OAuthAccount.create({
      userId: user._id,
      provider,
      providerUserId,
      email,
    });

    // Create default workspace for new user
    const workspaces = await workspaceService.getWorkspacesForUser(user._id);
    let activeWorkspaceId: string;
    
    if (workspaces.length === 0) {
      // Create workspace only if user doesn't have any
      const workspace = await workspaceService.createWorkspace(
        user._id,
        `${user.email}'s Workspace`,
      );
      activeWorkspaceId = workspace._id.toString();
    } else {
      activeWorkspaceId = workspaces[0].workspace._id.toString();
    }

    // Create session
    const session = await lucia.createSession(user._id, {
      activeWorkspaceId,
    });
    
    return { user, session, isNewUser: true };
  }

  /**
   * Validate session and get user
   */
  async validateSession(sessionId: string) {
    const result = await lucia.validateSession(sessionId);
    
    if (!result.session || !result.user) {
      return { session: null, user: null };
    }

    // Get full user data
    const user = await User.findById(result.user.id);
    if (!user) {
      return { session: null, user: null };
    }

    return { 
      session: result.session,
      user: {
        id: user._id,
        email: user.email,
        createdAt: user.createdAt,
      },
    };
  }

  /**
   * Logout user by invalidating session
   */
  async logout(sessionId: string) {
    await lucia.invalidateSession(sessionId);
  }

  /**
   * Get OAuth accounts linked to a user
   */
  async getLinkedAccounts(userId: string) {
    const accounts = await OAuthAccount.find({ userId });
    return accounts.map(account => ({
      provider: account.provider,
      email: account.email,
      linkedAt: account.createdAt,
    }));
  }
}