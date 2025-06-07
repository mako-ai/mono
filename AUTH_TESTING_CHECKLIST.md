# Authentication System Testing Checklist

This checklist covers all the manual tests you should perform to ensure the authentication system is working correctly.

## Setup Requirements

Before testing, ensure you have:
- [ ] Created a `.env` file based on `.env.example`
- [ ] Set up MongoDB (running locally or connection string configured)
- [ ] Configured Google OAuth credentials in Google Cloud Console
- [ ] Configured GitHub OAuth credentials in GitHub Developer Settings
- [ ] Run `pnpm install:all` to install dependencies
- [ ] Run `pnpm dev` to start both backend and frontend

## Basic Authentication Tests

### Registration
- [ ] **Valid Registration**: Register a new user with email and password (min 8 chars)
  - Verify user is redirected to dashboard
  - Verify session cookie is set
- [ ] **Duplicate Email**: Try registering with an already used email
  - Verify error message is displayed
- [ ] **Invalid Password**: Try registering with password < 8 characters
  - Verify validation error is shown
- [ ] **Password Mismatch**: Enter different passwords in password and confirm fields
  - Verify error is shown

### Login
- [ ] **Valid Login**: Login with registered email/password
  - Verify redirect to dashboard
  - Verify user info is displayed
- [ ] **Invalid Credentials**: Try wrong email or password
  - Verify error message "Invalid email or password"
- [ ] **Non-existent User**: Try logging in with unregistered email
  - Verify appropriate error message

### Logout
- [ ] **Logout Function**: Click logout button
  - Verify redirect to login page
  - Verify session cookie is cleared
  - Verify protected routes are no longer accessible

## OAuth Authentication Tests

### Google OAuth
- [ ] **Initial Login**: Click "Login with Google"
  - Verify redirect to Google consent screen
  - After consent, verify redirect back to app dashboard
  - Verify new user is created
- [ ] **Subsequent Login**: Login again with same Google account
  - Verify existing user is logged in (not duplicate created)
- [ ] **OAuth Error Handling**: Cancel Google consent
  - Verify redirect to login page with error parameter

### GitHub OAuth
- [ ] **Initial Login**: Click "Login with GitHub"
  - Verify redirect to GitHub authorization
  - After authorization, verify redirect to dashboard
- [ ] **Email Handling**: Test with GitHub account that has/hasn't public email
  - Verify system handles both cases gracefully
- [ ] **Subsequent Login**: Login again with same GitHub account
  - Verify existing user session is created

## Session Management Tests

### Session Persistence
- [ ] **Page Refresh**: Refresh page while logged in
  - Verify user remains authenticated
  - Verify user data is loaded correctly
- [ ] **Browser Restart**: Close and reopen browser
  - Verify session persists (if within duration)
- [ ] **Session Expiry**: Wait for session to expire (or modify expiry time for testing)
  - Verify user is logged out automatically

### Protected Routes
- [ ] **Authenticated Access**: Access protected routes while logged in
  - Verify routes load correctly
- [ ] **Unauthenticated Access**: Try accessing protected routes without login
  - Verify redirect to login page
  - Verify original URL is saved for post-login redirect
- [ ] **Loading State**: Check loading spinner appears during auth check

## Advanced Features Tests

### Account Linking
- [ ] **Link Multiple Providers**: 
  1. Register with email/password
  2. Link Google account
  3. Link GitHub account
  - Verify all providers shown in account settings
- [ ] **Login with Any Provider**: After linking, verify login works with:
  - Original email/password
  - Linked Google account
  - Linked GitHub account

### API Integration
- [ ] **401 Handling**: Make API call that returns 401
  - Verify automatic redirect to login
- [ ] **Auth Headers**: Inspect network requests
  - Verify cookies are included with `credentials: 'include'`

### Security Tests

### Rate Limiting
- [ ] **Login Attempts**: Try 6+ failed login attempts rapidly
  - Verify rate limit error after 5 attempts
  - Verify retry-after header is present
- [ ] **Registration Attempts**: Try multiple registrations rapidly
  - Verify rate limiting kicks in

### CSRF Protection
- [ ] **Cookie Attributes**: Inspect session cookie
  - Verify httpOnly is set
  - Verify sameSite is set to 'lax'
  - Verify secure is set in production

## Error Handling Tests

- [ ] **Network Errors**: Disconnect network and try auth operations
  - Verify graceful error handling
- [ ] **Server Errors**: Stop backend and try auth operations
  - Verify user-friendly error messages
- [ ] **Validation Errors**: Test all validation rules
  - Verify clear error messages for each case

## Performance Tests

- [ ] **Initial Load**: Measure time to check auth status on app load
- [ ] **Login Speed**: Verify login/registration completes quickly
- [ ] **Session Check**: Verify /api/auth/me endpoint responds fast

## Integration Tests

- [ ] **Frontend Integration**: Verify auth context provides:
  - Current user state
  - Loading states
  - Error states
  - All auth methods work correctly
- [ ] **API Client Integration**: Verify all API calls:
  - Include credentials
  - Handle 401 properly
  - Work with authenticated endpoints

## Production Readiness

- [ ] **Environment Variables**: Verify all required env vars are documented
- [ ] **Error Messages**: Ensure no sensitive info in error messages
- [ ] **Console Logs**: Remove or guard debug console.logs
- [ ] **TypeScript**: Verify no TypeScript errors in build
- [ ] **Build Test**: Run production build and test all features

## Known Limitations & Notes

1. Sessions are stored in MongoDB (not Redis) - suitable for moderate scale
2. Rate limiting is in-memory - resets on server restart
3. OAuth email handling - GitHub may not provide email in some cases
4. Session duration is configurable via SESSION_DURATION env var

## Troubleshooting Common Issues

1. **"Cannot connect to MongoDB"**: Ensure MongoDB is running and DATABASE_URL is correct
2. **OAuth redirect errors**: Check BASE_URL and CLIENT_URL match your setup
3. **Cookie not being set**: Ensure frontend and backend are on same domain or configure CORS properly
4. **TypeScript errors**: Run `pnpm install:all` to ensure all dependencies are installed