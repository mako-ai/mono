import { Google, GitHub } from "arctic";

/**
 * OAuth provider types
 */
export type OAuthProvider = "google" | "github";

// Lazy-loaded providers to ensure environment variables are loaded first
let _google: Google | null = null;
let _github: GitHub | null = null;

/**
 * Get Google OAuth provider (lazy-loaded)
 */
export function getGoogle(): Google {
  if (!_google) {
    if (
      !process.env.GOOGLE_CLIENT_ID ||
      !process.env.GOOGLE_CLIENT_SECRET ||
      !process.env.BASE_URL
    ) {
      throw new Error(
        "Missing Google OAuth environment variables: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, BASE_URL"
      );
    }
    _google = new Google(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${process.env.BASE_URL}/api/auth/google/callback`
    );
  }
  return _google;
}

/**
 * Get GitHub OAuth provider (lazy-loaded)
 */
export function getGitHub(): GitHub {
  if (!_github) {
    if (
      !process.env.GITHUB_CLIENT_ID ||
      !process.env.GITHUB_CLIENT_SECRET ||
      !process.env.BASE_URL
    ) {
      throw new Error(
        "Missing GitHub OAuth environment variables: GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, BASE_URL"
      );
    }
    _github = new GitHub(
      process.env.GITHUB_CLIENT_ID,
      process.env.GITHUB_CLIENT_SECRET,
      {
        redirectURI: `${process.env.BASE_URL}/api/auth/github/callback`,
      }
    );
  }
  return _github;
}

// Backwards compatibility exports (deprecated - use functions instead)
export const google = {
  get instance() {
    return getGoogle();
  },
};

export const github = {
  get instance() {
    return getGitHub();
  },
};
