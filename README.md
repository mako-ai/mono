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

Access the web interface at http://localhost:3000 to:
- Add and configure data sources (Close.com, Stripe, GraphQL)
- Manage database connections
- Set up sync schedules
- Monitor sync status

## Sync Commands

The platform provides a unified sync command that works with any data source defined in your configuration:

```bash
# Show sync command usage
pnpm run sync

# Sync all entities from a data source
pnpm run sync close_spain

# Sync specific entity from a data source
pnpm run sync close_spain leads
pnpm run sync close_spain opportunities
pnpm run sync stripe_spain customers

# Sync to a different target database
pnpm run sync close_spain --db=warehouse_db
pnpm run sync close_spain leads --db=analytics_db
```

### Available Entities

**Close.com:**

- leads
- opportunities
- contacts
- activities
- users
- custom-fields

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
pnpm run dev                # Start both API and frontend in dev mode
pnpm run api:dev            # Start API server only
pnpm run app:dev            # Start frontend only
```

## Query Runner

Run MongoDB queries across different databases:

```bash
# Run query on default database
pnpm run query queries/example.js

# Run query on specific database
pnpm run query queries/example.js --db=analytics_db
```

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
   PORT=3001
   ```

3. Start MongoDB:

   ```bash
   pnpm run docker:up
   ```

4. Start syncing:
   ```bash
   pnpm run sync close_spain
   pnpm run sync stripe_spain customers
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

### Using Mongo Express

1. Open http://localhost:8081
2. Navigate to `multi_tenant_analytics` database
3. Browse collections and run queries

### Using MongoDB Compass

Connect to: `mongodb://localhost:27018/multi_tenant_analytics`

### Command Line

```bash
# Connect to MongoDB container
docker exec -it mongo mongosh multi_tenant_analytics

# Example query
db.leads.find({_dataSourceId: "close_spain"}).count()
```

## Sample Analytics Queries

Ready-made queries are available in the `queries/` folder:

```bash
# Run a specific query
pnpm run query <query_name>

# List available queries
pnpm run query --list
```

Example queries:

- Sales by salesperson by month
- Average time to close by salesperson
- Open opportunities by salesperson
- Stale opportunities analysis

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
├── sync/                    # Sync scripts and utilities
│   ├── sync.ts              # Unified sync command
│   ├── connector-registry.ts # Connector bridge
│   ├── database-data-source-manager.ts # Database-based config
│   └── query-runner.ts      # Query execution
├── api/                     # Backend API server
│   └── src/
│       ├── connectors/      # Connector implementations
│       │   ├── close/       # Close.com connector
│       │   ├── stripe/      # Stripe connector
│       │   └── graphql/     # GraphQL connector
│       ├── routes/          # API endpoints
│       ├── database/        # Database schemas
│       └── auth/            # Authentication
├── app/                     # Frontend React application
│   └── src/
│       ├── components/      # React components
│       ├── pages/           # Page components
│       └── store/           # State management
├── consoles/                # MongoDB query library
├── docker-compose.yml       # Docker services
├── .env                     # Environment variables
└── package.json            # Dependencies
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
