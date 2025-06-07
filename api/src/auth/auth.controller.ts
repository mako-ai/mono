import { Hono } from 'hono';
import { setCookie } from 'hono/cookie';
import { generateState, generateCodeVerifier } from 'arctic';
import { lucia } from './lucia';
import { google, github } from './arctic';
import { AuthService } from './auth.service';
import { authMiddleware, rateLimitMiddleware } from './auth.middleware';

const authService = new AuthService();
export const authRoutes = new Hono();

// Apply rate limiting to auth endpoints
const authRateLimiter = rateLimitMiddleware(
  parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
  parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '5')
);

/**
 * Register new user
 */
authRoutes.post('/register', authRateLimiter, async (c) => {
  try {
    const { email, password } = await c.req.json();
    
    const { user, session } = await authService.register(email, password);
    
    // Set session cookie
    const sessionCookie = lucia.createSessionCookie(session.id);
    setCookie(c, sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
    
    return c.json({
      user: {
        id: user._id,
        email: user.email,
        createdAt: user.createdAt,
      },
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

/**
 * Login user
 */
authRoutes.post('/login', authRateLimiter, async (c) => {
  try {
    const { email, password } = await c.req.json();
    
    const { user, session } = await authService.login(email, password);
    
    // Set session cookie
    const sessionCookie = lucia.createSessionCookie(session.id);
    setCookie(c, sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
    
    return c.json({
      user: {
        id: user._id,
        email: user.email,
        createdAt: user.createdAt,
      },
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

/**
 * Logout user
 */
authRoutes.post('/logout', authMiddleware, async (c) => {
  try {
    const session = c.get('session');
    
    await authService.logout(session.id);
    
    // Clear session cookie
    const sessionCookie = lucia.createBlankSessionCookie();
    setCookie(c, sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
    
    return c.json({ message: 'Logged out successfully' });
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

/**
 * Get current user
 */
authRoutes.get('/me', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    
    // Get linked accounts
    const linkedAccounts = await authService.getLinkedAccounts(user.id);
    
    return c.json({
      user: {
        id: user.id,
        email: user.attributes.email,
        linkedAccounts,
      },
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

/**
 * Refresh session
 */
authRoutes.post('/refresh', async (c) => {
  try {
    const sessionId = lucia.readSessionCookie(c.req.header('Cookie') || '');
    
    if (!sessionId) {
      return c.json({ error: 'No session found' }, 401);
    }
    
    const { session, user } = await authService.validateSession(sessionId);
    
    if (!session || !user) {
      return c.json({ error: 'Invalid session' }, 401);
    }
    
    // Refresh session if needed
    if (session.fresh) {
      const sessionCookie = lucia.createSessionCookie(session.id);
      setCookie(c, sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
    }
    
    return c.json({
      user: {
        id: user.id,
        email: user.email,
      },
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

/**
 * Google OAuth initiation
 */
authRoutes.get('/google', async (c) => {
  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  
  // Store state and code verifier in cookies
  setCookie(c, 'google_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 10, // 10 minutes
    sameSite: 'lax',
  });
  
  setCookie(c, 'google_code_verifier', codeVerifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 10, // 10 minutes
    sameSite: 'lax',
  });
  
  const url = google.createAuthorizationURL(state, codeVerifier, ['openid', 'email']);
  
  return c.redirect(url.toString());
});

/**
 * Google OAuth callback
 */
authRoutes.get('/google/callback', async (c) => {
  try {
    const code = c.req.query('code');
    const state = c.req.query('state');
    const storedState = c.req.cookie('google_oauth_state');
    const codeVerifier = c.req.cookie('google_code_verifier');
    
    if (!code || !state || !storedState || !codeVerifier || state !== storedState) {
      return c.redirect(`${process.env.CLIENT_URL}/login?error=oauth_error`);
    }
    
    const tokens = await google.validateAuthorizationCode(code, codeVerifier);
    
    // Get user info from Google
    const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: {
        Authorization: `Bearer ${tokens.accessToken()}`,
      },
    });
    
    const googleUser: any = await response.json();
    
    const { user, session, isNewUser } = await authService.handleOAuthCallback(
      'google',
      googleUser.sub,
      googleUser.email
    );
    
    // Set session cookie
    const sessionCookie = lucia.createSessionCookie(session.id);
    setCookie(c, sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
    
    // Clear OAuth cookies
    setCookie(c, 'google_oauth_state', '', { maxAge: 0 });
    setCookie(c, 'google_code_verifier', '', { maxAge: 0 });
    
    return c.redirect(`${process.env.CLIENT_URL}/dashboard`);
  } catch (error: any) {
    console.error('Google OAuth error:', error);
    return c.redirect(`${process.env.CLIENT_URL}/login?error=oauth_error`);
  }
});

/**
 * GitHub OAuth initiation
 */
authRoutes.get('/github', async (c) => {
  const state = generateState();
  
  setCookie(c, 'github_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 10, // 10 minutes
    sameSite: 'lax',
  });
  
  const url = github.createAuthorizationURL(state, ['user:email']);
  
  return c.redirect(url.toString());
});

/**
 * GitHub OAuth callback
 */
authRoutes.get('/github/callback', async (c) => {
  try {
    const code = c.req.query('code');
    const state = c.req.query('state');
    const storedState = c.req.cookie('github_oauth_state');
    
    if (!code || !state || !storedState || state !== storedState) {
      return c.redirect(`${process.env.CLIENT_URL}/login?error=oauth_error`);
    }
    
    const tokens = await github.validateAuthorizationCode(code);
    
    // Get user info from GitHub
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${tokens.accessToken()}`,
      },
    });
    
    const githubUser: any = await userResponse.json();
    
    // Get primary email
    const emailResponse = await fetch('https://api.github.com/user/emails', {
      headers: {
        Authorization: `Bearer ${tokens.accessToken()}`,
      },
    });
    
    const emails: any[] = await emailResponse.json();
    const primaryEmail = emails.find((e) => e.primary)?.email;
    
    const { user, session, isNewUser } = await authService.handleOAuthCallback(
      'github',
      githubUser.id.toString(),
      primaryEmail || githubUser.email
    );
    
    // Set session cookie
    const sessionCookie = lucia.createSessionCookie(session.id);
    setCookie(c, sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
    
    // Clear OAuth cookie
    setCookie(c, 'github_oauth_state', '', { maxAge: 0 });
    
    return c.redirect(`${process.env.CLIENT_URL}/dashboard`);
  } catch (error: any) {
    console.error('GitHub OAuth error:', error);
    return c.redirect(`${process.env.CLIENT_URL}/login?error=oauth_error`);
  }
});

export default authRoutes;