# Data Analytics Platform

A flexible data analytics platform that syncs data from multiple sources (Close.com, Stripe, etc.) to MongoDB databases.

## Architecture

The platform uses a data source-based architecture where each connection (API or database) is treated as an independent data source with its own configuration.

## Configuration

All data sources are configured in `config/config.yaml`:

```yaml
data_sources:
  close_spain:
    name: "Spain Close CRM"
    type: "close"
    active: true
    connection:
      api_key: "${CLOSE_API_KEY_SPAIN}"
    settings:
      sync_batch_size: 100
      rate_limit_delay_ms: 200

  stripe_spain:
    name: "Spain Stripe Payments"
    type: "stripe"
    active: true
    connection:
      api_key: "${STRIPE_API_KEY_SPAIN}"
    settings:
      sync_batch_size: 50
      rate_limit_delay_ms: 300

  analytics_db:
    name: "Main Analytics Database"
    type: "mongodb"
    active: true
    connection:
      connection_string: "mongodb://localhost:27018/multi_tenant_analytics"
      database: "multi_tenant_analytics"
```

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
# Configuration management
pnpm run config:validate    # Validate configuration
pnpm run config:list        # List all data sources
pnpm run config:show <id>   # Show specific data source details

# Docker management
pnpm run docker:up          # Start MongoDB and other services
pnpm run docker:down        # Stop all services
pnpm run docker:logs        # View logs
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
   CLOSE_API_KEY_SPAIN=your_api_key
   CLOSE_API_KEY_ITALY=your_api_key
   STRIPE_API_KEY_SPAIN=your_api_key
   MONGODB_CONNECTION_STRING=mongodb://localhost:27018
   MONGODB_DATABASE=multi_tenant_analytics
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

Simply add the configuration to `config/config.yaml` and start using it immediately:

```yaml
data_sources:
  my_new_source:
    name: "My New Data Source"
    type: "close" # or "stripe", etc.
    active: true
    connection:
      api_key: "${MY_API_KEY}"
    settings:
      sync_batch_size: 100
      rate_limit_delay_ms: 200
```

Then sync it:

```bash
pnpm run sync my_new_source
```

No additional setup required!

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
├── src/
│   ├── sync.ts              # Unified sync command
│   ├── sync-close.ts        # Close.com sync implementation
│   ├── sync-stripe.ts       # Stripe sync implementation
│   ├── data-source-manager.ts # Configuration manager
│   └── query-runner.ts      # Query execution
├── config/
│   └── config.yaml          # Data source configuration
├── scripts/
│   └── config.ts            # Configuration utilities
├── queries/                 # MongoDB query library
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
