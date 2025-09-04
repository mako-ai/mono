# Inngest Development Configuration

## Scheduled Sync Job Behavior

To prevent conflicts between DEV and PROD environments that share the same database and Inngest credentials, the scheduled sync job function (`scheduledSyncJobFunction`) is automatically disabled when running in development mode.

### How it works

The scheduled sync job that runs every 5 minutes is disabled when:

- `NODE_ENV` is not set to `"production"` (default in development)
- OR `DISABLE_SCHEDULED_SYNC` environment variable is set to `"true"`

### Available Functions in Each Environment

**Development Mode:**

- ✅ `syncJobFunction` - Execute sync jobs (triggered by manual or other events)
- ✅ `manualSyncJobFunction` - Manual sync job trigger
- ✅ `cancelSyncJobFunction` - Cancel running sync jobs
- ✅ `cleanupAbandonedJobsFunction` - Cleanup abandoned jobs
- ❌ `scheduledSyncJobFunction` - **DISABLED** to prevent DEV/PROD conflicts

**Production Mode:**

- ✅ All functions above are enabled, including the scheduled sync job

### Console Output

When starting the API server, you'll see one of these messages:

- Development: `⚠️  Scheduled sync job is DISABLED in development mode`
- Production: `✅ Scheduled sync job is ENABLED in production mode`

### Override Options

If you need to test the scheduled sync job locally, you can:

1. Set `NODE_ENV=production` when starting the dev server
2. Or keep it disabled and manually trigger sync jobs through the UI or API

### Manual Testing

Even with the scheduled job disabled, you can still:

- Manually trigger sync jobs via the API or UI
- Test individual sync job executions
- Debug sync functionality without automatic scheduling

This configuration ensures that your local development environment won't interfere with production scheduled jobs while still maintaining full testing capabilities.
