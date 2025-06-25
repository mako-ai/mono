# Sync Worker Architecture

## Overview

The sync worker handles scheduled data synchronization jobs. It can run in two modes:

1. **Development Mode**: Separate process for easier debugging
2. **Production Mode**: Embedded within the API process for simpler deployment

## Development Setup

When running `pnpm dev`, three processes start automatically:

- React app (frontend)
- API server
- Sync worker

No additional commands needed!

## Production/Docker Setup

In production (NODE_ENV=production) or when ENABLE_SYNC_WORKER=true, the worker starts automatically inside the API process. This provides:

- **Single Process**: Easier Docker deployment
- **Shared Resources**: Same database connections
- **Graceful Shutdown**: Coordinated process termination
- **Simplified Monitoring**: One process to monitor

## Configuration

### Environment Variables

- `NODE_ENV=production` - Automatically enables the worker
- `ENABLE_SYNC_WORKER=true` - Force-enable the worker (useful for testing)

### Running Modes

```bash
# Development (3 separate processes)
pnpm dev

# Production (single process)
NODE_ENV=production pnpm api:start

# Force worker in development
ENABLE_SYNC_WORKER=true pnpm api:dev

# Run worker separately (if needed)
pnpm --filter api run worker
```

## Architecture Benefits

### Single Process Benefits

1. **Simpler Deployment**: One Docker container, one process
2. **Resource Efficiency**: Shared database connections and memory
3. **Easier Monitoring**: Single health check endpoint
4. **Consistent State**: Worker and API share the same runtime

### Distributed Locking

The worker uses MongoDB for distributed locking to ensure:

- Only one scheduler runs across multiple instances
- Jobs don't execute concurrently
- Graceful failover if a worker dies

## Docker Deployment

The Dockerfile runs a single Node.js process that:

1. Serves the React frontend
2. Handles API requests
3. Runs scheduled sync jobs

```dockerfile
CMD ["dist/index.js"]  # Single entry point
```

## Scaling Considerations

When scaling horizontally:

- Multiple API instances can run
- Only one will acquire the worker lock
- If the primary worker dies, another takes over
- Jobs are distributed via MongoDB locking

## Alternative: Separate Worker Process

If you need a separate worker process (e.g., for resource isolation):

1. Remove the worker initialization from `api/src/index.js`
2. Use a process manager like PM2 or systemd
3. Or use Docker Compose with multiple services:

```yaml
services:
  api:
    build: .
    command: ["dist/index.js"]
    environment:
      - ENABLE_SYNC_WORKER=false

  worker:
    build: .
    command: ["dist/worker.js"]
```

But for most use cases, the embedded worker is simpler and sufficient.
