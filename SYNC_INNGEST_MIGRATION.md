# Sync Jobs Migration to Inngest

This document describes the migration from the built-in node-cron worker to Inngest for sync job scheduling and execution.

## Overview

We've migrated the sync job scheduling system from a custom node-cron based worker to Inngest, a modern event-driven job orchestration platform. This provides better reliability, scalability, and observability.

## What Changed

### Removed Components

1. **Worker Process** (`api/src/worker.ts`) - The entire worker file has been removed
2. **Worker Initialization** - Removed worker startup code from `api/src/index.ts`
3. **Worker Health Checks** - Removed `/health/worker` endpoint
4. **Dependencies** - Removed `node-cron` and `@types/node-cron`

### Added Components

1. **Inngest Client** (`api/src/inngest/client.ts`) - Inngest configuration
2. **Sync Job Functions** (`api/src/inngest/functions/sync-job.ts`) - All job execution logic
3. **Inngest Endpoint** - Added `/api/inngest` endpoint for Inngest communication
4. **Dependencies** - Added `inngest` and `cron-parser`

## Key Improvements

### 1. Better Job Scheduling
- Inngest handles cron scheduling with proper timezone support
- Built-in concurrency control prevents duplicate job executions
- Automatic retries with exponential backoff

### 2. Enhanced Observability
- All job executions are tracked in Inngest's dashboard
- Real-time monitoring of job status and logs
- Easy debugging with step-by-step execution traces

### 3. Simplified Architecture
- No need to manage worker processes
- No complex lock management code
- Inngest handles all the infrastructure complexity

### 4. Scalability
- Inngest automatically scales based on workload
- Jobs can run across multiple instances without conflicts
- Built-in rate limiting and throttling

## Functions

### 1. `syncJobFunction`
- Executes individual sync jobs
- Handles logging, error tracking, and status updates
- Triggered by events: `sync/job.execute`

### 2. `scheduledSyncJobFunction`
- Runs every minute to check for scheduled jobs
- Parses cron expressions and triggers jobs as needed
- Uses `cron-parser` for accurate scheduling

### 3. `manualSyncJobFunction`
- Handles manual job triggers from the UI
- Triggered by events: `sync/job.manual`

### 4. `cleanupAbandonedJobsFunction`
- Runs every 5 minutes
- Cleans up abandoned job executions and stale locks
- Maintains database hygiene

## Environment Variables

### Removed
- `ENABLE_SYNC_WORKER` - No longer needed

### Added
- `INNGEST_EVENT_KEY` - Your Inngest event key (optional for local dev)
- `INNGEST_SIGNING_KEY` - Your Inngest signing key (optional for local dev)

## Local Development

1. Start the Inngest Dev Server:
```bash
npx inngest-cli@latest dev
```

2. Start your API server:
```bash
pnpm api:dev
```

3. The Inngest dashboard will be available at http://localhost:8288

## Production Deployment

1. Sign up for an Inngest account at https://inngest.com
2. Create an app and get your keys
3. Set the environment variables:
   - `INNGEST_EVENT_KEY`
   - `INNGEST_SIGNING_KEY`
4. Deploy your application
5. Inngest will automatically discover your functions via the `/api/inngest` endpoint

## Testing

### Manual Job Execution
```bash
# Trigger a sync job manually
curl -X POST http://localhost:8080/api/workspaces/{workspaceId}/sync-jobs/{jobId}/run
```

### View Executions
- Local: http://localhost:8288
- Production: https://app.inngest.com

## Rollback Plan

If you need to rollback to the worker-based system:

1. Restore `api/src/worker.ts`
2. Re-add worker initialization code to `api/src/index.ts`
3. Re-install dependencies: `pnpm add node-cron @types/node-cron`
4. Remove Inngest-related files and dependencies
5. Set `ENABLE_SYNC_WORKER=true`

## Migration Checklist

- [x] Remove worker.ts
- [x] Remove worker initialization from index.ts
- [x] Add Inngest client configuration
- [x] Create Inngest functions for sync jobs
- [x] Update sync job routes to use Inngest
- [x] Add Inngest endpoint to API
- [x] Remove node-cron dependencies
- [x] Add Inngest and cron-parser dependencies
- [x] Update documentation
- [ ] Test all sync job functionality
- [ ] Deploy to staging
- [ ] Monitor job executions
- [ ] Deploy to production