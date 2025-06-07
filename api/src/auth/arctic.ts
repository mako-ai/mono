import { Google, GitHub } from 'arctic';

/**
 * Google OAuth provider configuration
 */
export const google = new Google(
  process.env.GOOGLE_CLIENT_ID!,
  process.env.GOOGLE_CLIENT_SECRET!,
  `${process.env.BASE_URL}/api/auth/google/callback`
);

/**
 * GitHub OAuth provider configuration
 */
export const github = new GitHub(
  process.env.GITHUB_CLIENT_ID!,
  process.env.GITHUB_CLIENT_SECRET!,
  `${process.env.BASE_URL}/api/auth/github/callback`
);

/**
 * OAuth provider types
 */
export type OAuthProvider = 'google' | 'github';