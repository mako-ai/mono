# Automated Sync Job Scheduling Implementation

## Overview

This implementation provides automated data synchronization job scheduling using MongoDB for persistence and node-cron for scheduling, avoiding unmaintained libraries like Agenda.js.

## Architecture

### Components

1. **Database Schema** (`api/src/database/workspace-schema.ts`)

   - `SyncJob` model stores job configurations including:
     - Schedule (cron expression + timezone)
     - Source data source and destination database
     - Sync mode (full/incremental)
     - Entity filtering
     - Job status and history

2. **API Routes** (`api/src/routes/sync-jobs.ts`)
   - CRUD operations for sync jobs
   - Manual job triggering
   - Job status monitoring
3. **Worker Process** (`api/src/worker.ts`)

   - Runs scheduled jobs using node-cron
   - Implements distributed locking (prevents duplicate executions)
   - Watches for job changes via MongoDB change streams
   - Handles graceful shutdown

4. **Sync Executor** (`api/src/services/sync-executor.service.ts`)
   - Spawns sync process to execute jobs
   - Reuses existing sync CLI implementation

## Key Features

### Distributed Locking

- **Worker Lock**: Ensures only one worker process runs across multiple instances
- **Job Lock**: Prevents duplicate job executions
- MongoDB-based locking with automatic expiry

### Dynamic Job Management

- Jobs can be created/updated/deleted via API
- Worker automatically picks up changes via MongoDB change streams
- No restart required for schedule changes

### Monitoring & Error Handling

- Job execution history tracking
- Error logging and retry capability
- Average duration tracking
- Next run time calculation

## Usage

### Starting the Services

```bash
# Terminal 1: Start API server
cd api && pnpm dev

# Terminal 2: Start worker process
cd api && pnpm worker:dev
```

### Creating a Sync Job

```bash
# Create a job that runs every hour
curl -X POST http://localhost:8080/api/workspaces/{workspaceId}/sync-jobs \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Hourly Stripe Sync",
    "dataSourceId": "{dataSourceId}",
    "destinationDatabaseId": "{databaseId}",
    "schedule": {
      "cron": "0 * * * *",
      "timezone": "America/New_York"
    },
    "syncMode": "incremental",
    "enabled": true
  }'
```

### API Endpoints

- `GET /api/workspaces/:workspaceId/sync-jobs` - List all jobs
- `POST /api/workspaces/:workspaceId/sync-jobs` - Create job
- `PUT /api/workspaces/:workspaceId/sync-jobs/:id` - Update job
- `DELETE /api/workspaces/:workspaceId/sync-jobs/:id` - Delete job
- `POST /api/workspaces/:workspaceId/sync-jobs/:id/toggle` - Enable/disable job
- `POST /api/workspaces/:workspaceId/sync-jobs/:id/run` - Manually trigger job
- `GET /api/workspaces/:workspaceId/sync-jobs/:id/status` - Get job status

## Cron Expression Examples

- `*/5 * * * *` - Every 5 minutes
- `0 * * * *` - Every hour
- `0 0 * * *` - Daily at midnight
- `0 0 * * 0` - Weekly on Sunday
- `0 0 1 * *` - Monthly on the 1st

## Production Deployment

### Single Instance

```bash
# Start both API and worker in one process (not recommended for production)
# Would require modifying index.ts to also start the worker
```

### Multiple Instances

```bash
# API instances (can scale horizontally)
npm start

# Worker instance (only one will be active due to locking)
npm run worker
```

### Docker Compose Example

```yaml
version: "3.8"
services:
  api:
    build: .
    command: npm start
    scale: 3 # Multiple API instances

  worker:
    build: .
    command: npm run worker
    scale: 2 # Only one will acquire the lock
```

## Monitoring

Check worker status:

```bash
# View worker lock
mongo $DATABASE_URL --eval "db.worker_locks.find()"

# View active job locks
mongo $DATABASE_URL --eval "db.job_execution_locks.find()"

# View job statuses
mongo $DATABASE_URL --eval "db.syncjobs.find({}, {name:1, lastRunAt:1, lastError:1})"
```

## Future Enhancements

1. **Job Queue System**: If higher throughput needed, migrate to BullMQ with Redis
2. **Metrics**: Add Prometheus metrics for job execution
3. **Alerting**: Integrate with PagerDuty/Slack for job failures
4. **UI**: Build admin interface for job management
5. **Retry Logic**: Implement exponential backoff for failed jobs
6. **Job Dependencies**: Allow jobs to depend on other jobs
7. **Concurrency Control**: Limit concurrent job executions
