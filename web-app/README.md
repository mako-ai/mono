# Query Web App

A user-friendly web interface for running MongoDB queries with a modern React frontend and Hono API backend.

## Features

- **Query Explorer**: Browse and select queries from the file system in a tree structure
- **Query Editor**: View query content (Monaco Editor integration coming soon)
- **Results Table**: Display query results in a data table with MUI DataGrid Premium
- **AI Assistant**: Chat integration for query assistance (coming soon)

## Architecture

```
web-app/
├── frontend/          # React + Vite + MUI
├── backend/           # Hono API server
└── Dockerfile         # Multi-stage build for production
```

## Development Setup

### Prerequisites

- Docker and Docker Compose
- Optional: Node.js 18+ and pnpm (for frontend development)

### Quick Start

1. **Start the backend and MongoDB:**

```bash
# From the root project directory
docker-compose up mongodb web-backend-dev
```

2. **Start the frontend (locally for hot reload):**

```bash
# In a new terminal
cd web-app/frontend
pnpm install
pnpm run dev
```

This will give you:

- MongoDB on port 27018
- Backend API on http://localhost:3001
- Frontend dev server on http://localhost:5173 (with hot reload)
- Mongo Express on http://localhost:8082

### Alternative: All in Docker

If you prefer to run everything in Docker:

```bash
# Build and start everything
docker-compose up mongodb web-backend-dev

# Frontend will need to be built separately for now
# (Full Docker frontend integration coming soon)
```

### Development Workflow

1. **Backend Development**:

   - The backend runs in Docker with hot reload via `tsx watch`
   - Edit files in `web-app/backend/src/` and changes will be reflected immediately
   - Logs: `docker-compose logs -f web-backend-dev`

2. **Frontend Development**:

   - Run locally with `pnpm run dev` for best hot reload experience
   - API calls proxy to `http://localhost:3001` automatically

3. **Query Development**:
   - Add/edit `.js` files in the `queries/` directory
   - Changes are immediately available via the API

## API Endpoints

- `GET /api/queries` - List all queries in tree structure
- `GET /api/queries/:path` - Get specific query content
- `POST /api/queries/:path` - Create new query
- `PUT /api/queries/:path` - Update existing query
- `POST /api/run/:path` - Execute query and return results
- `GET /health` - Health check

## Production

Build and run the full production stack:

```bash
# Build and start production services
docker-compose --profile production up
```

The production app will be available at http://localhost:3000

## Environment Variables

The backend uses these environment variables (set in docker-compose.yml):

- `WEB_API_PORT` - Port for the API server
- `MONGODB_CONNECTION_STRING` - MongoDB connection string
- `MONGODB_DATABASE` - MongoDB database name
- `NODE_ENV` - Environment (development/production)

## Troubleshooting

### Backend Connection Issues

If you see `ENOTFOUND mongodb` errors:

- Ensure you're running the backend via Docker Compose (not locally)
- The backend needs to be in the same Docker network as MongoDB

### Frontend API Issues

- Check that the backend is running on port 3001
- Verify the proxy configuration in `vite.config.ts`

### Query Not Found Errors

- Ensure query files end with `.js`
- Check that the queries directory is properly mounted in Docker
- Use the exact path structure (e.g., `all/opps_won_by_country_by_month`)
