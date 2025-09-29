# Data Analytics Platform

A flexible data analytics platform that syncs data from multiple sources (Close.com, Stripe, etc.) to MongoDB databases.

## Architecture

The platform uses a data source-based architecture where each connection (API or database) is treated as an independent data source with its own configuration.

## Configuration

Data sources and databases are now managed through the web interface, stored in MongoDB. This provides:

- Secure encrypted storage of API keys and connection strings
- Multi-workspace support
- Real-time configuration updates
- Database connection testing

Access the web interface at http://localhost:5173 to:

- Add and configure data sources (Close.com, Stripe, GraphQL)
- Manage database connections
- Set up sync schedules
- Monitor sync status

## Sync Commands

Use the interactive sync tool to sync any configured data source to a destination database:

```bash
# Interactive mode (recommended)
pnpm run sync

# Help
pnpm run sync --help

# Non-interactive examples
# Sync all entities from a source to a destination
pnpm run sync -s <source_id> -d <destination_id>

# Sync specific entities
pnpm run sync -s <source_id> -d <destination_id> -e leads -e opportunities

# Incremental sync (only new/updated records)
pnpm run sync -s <source_id> -d <destination_id> -e leads --incremental
```

**Note:** Data source IDs are automatically generated when you add data sources through the web interface. You can find these IDs in the Data Sources page.

### Available Entities

**Close.com:**

- leads
- opportunities
- contacts
- activities
- users
- custom_fields

**Stripe:**

- customers
- subscriptions
- charges
- invoices
- products
- plans

## Management Commands

```bash
# Docker management
pnpm run docker:up          # Start MongoDB and other services
pnpm run docker:down        # Stop all services
pnpm run docker:logs        # View logs

# Development
pnpm run dev                # Start API, frontend, and Inngest dev server
pnpm run api:dev            # Start API server only (defaults to port 8080)
pnpm run app:dev            # Start frontend only (defaults to port 5173)
```

## Query Runner

Run MongoDB aggregation pipelines against your synced databases using the CLI tool in the API package:

```bash
# Using tsx directly
pnpm --filter api exec tsx src/sync/query-runner.ts
```

The query runner reads a JSON aggregation pipeline from a file, supports selecting the target data source, and uses the unified MongoDB connection pool.

## Setup

1. Install dependencies:

   ```bash
   npm install
   # or
   yarn install
   # or
   pnpm install
   ```

2. Configure environment variables in `.env`:

   ```env
   DATABASE_URL=mongodb://localhost:27017/mako
   ENCRYPTION_KEY=your_32_character_hex_key_for_encryption
   # API server port (defaults to 8080 if not set)
   WEB_API_PORT=8080
   # OAuth and client URLs
   BASE_URL=http://localhost:8080
   CLIENT_URL=http://localhost:5173
   ```

3. Start MongoDB:

   ```bash
   pnpm run docker:up
   ```

4. Start the development servers:

   ```bash
   pnpm run dev
   ```

5. Configure your first data source:

   - Open http://localhost:5173 in your browser
   - Navigate to Data Sources and add your first connector
   - Add a target database in the Databases section

6. Start syncing:

   ```bash
   # Interactive mode
   pnpm run sync

   # Or non-interactive
   pnpm run sync -s <source_id> -d <destination_id>
   ```

## Adding New Data Sources

Add new data sources through the web interface:

1. Open http://localhost:3000
2. Navigate to the Data Sources page
3. Click "Add Data Source"
4. Choose your connector type (Close.com, Stripe, GraphQL)
5. Enter your connection details (API keys, endpoints, etc.)
6. Test the connection
7. Save the configuration

Then sync it using the data source ID:

```bash
pnpm run sync <data_source_id>
```

All configuration is securely stored and encrypted in the database!

## Data Source Types

- **API Sources**: Close.com, Stripe, REST APIs
- **Database Sources**: MongoDB (used as sync targets)
- **Future**: PostgreSQL, MySQL, GraphQL APIs

## Development

```bash
# Run in development mode
pnpm run dev

# Build TypeScript
pnpm run build

# Run tests
pnpm run test

# Lint code
pnpm run lint

# Format code
pnpm run format
```

## Data Structure

The sync process creates MongoDB collections for each entity type. Each record includes:

- Original data from the source
- `_dataSourceId`: The ID of the source
- `_dataSourceName`: The name of the source
- `_syncedAt`: Timestamp of when the data was synced

### Atomic Updates

The sync process uses a staging approach to ensure data consistency:

1. Downloads all data to a staging collection
2. Swaps collections atomically
3. Drops the old collection

This ensures your queries never see partial data.

## Querying Data

### Using MongoDB Compass

Connect to: `mongodb://localhost:27017/mako`

### Using the Web Interface

1. Open http://localhost:5173
2. Navigate to the chat interface
3. Use natural language to query your data
4. The AI assistant will help you explore your databases

### Command Line

```bash
# Connect to MongoDB directly
mongosh mongodb://localhost:27017/mako

# Example query (replace data_source_id with your actual ID)
db.leads.find({_dataSourceId: "<your_data_source_id>"}).count()
```

## Sample Analytics

Use the web app chat and explorers to build and run queries, or provide your own aggregation pipelines to the query runner.

## Troubleshooting

### Common Issues

**API Rate Limiting:**

- Increase `rate_limit_delay_ms` in the data source configuration
- The sync will automatically retry with exponential backoff

**MongoDB Connection Issues:**

- Ensure Docker containers are running: `pnpm run docker:up`
- Check logs: `pnpm run docker:logs`

**Large Dataset Sync:**

- The process handles large datasets automatically
- Monitor progress in console output
- Adjust `sync_batch_size` for optimal performance

### Performance Tips

- Run syncs during off-hours to avoid API limits
- Use appropriate batch sizes (50-100 for most APIs)
- Monitor memory usage for very large datasets

## Project Structure

```
data-analytics-platform/
├── api/                     # Backend API server (Hono)
│   └── src/
│       ├── connectors/      # Connector implementations
│       │   ├── base/        # Base connector interface
│       │   ├── close/       # Close.com connector
│       │   ├── stripe/      # Stripe connector
│       │   ├── graphql/     # GraphQL connector
│       │   └── registry.ts  # Connector registry (runtime discovery)
│       ├── sync/            # Sync CLI and orchestrator (Inngest integrated)
│       ├── routes/          # API endpoints
│       ├── database/        # MongoDB schemas
│       ├── auth/            # Authentication (Lucia + Arctic)
│       ├── services/        # Business logic services
│       └── middleware/      # API middleware
├── app/                     # Frontend React application (Vite + React)
│   └── src/
│       ├── components/
│       ├── contexts/
│       ├── hooks/
│       ├── lib/
│       └── store/
├── docs/                    # Documentation
├── dist/                    # Compiled shared libraries
├── .env                     # Environment variables
└── package.json             # Dependencies and scripts
```

## Next Steps

- [ ] Add more source types (PostgreSQL, MySQL, GraphQL)
- [ ] Add real-time sync capabilities
- [ ] Create analytics dashboard
- [ ] Add data transformation pipelines
- [ ] Add scheduling with cron jobs

## Support

- Close.com API: https://developer.close.com/
- Stripe API: https://stripe.com/docs/api
- MongoDB: https://docs.mongodb.com/
