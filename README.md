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

The platform provides a unified sync command that works with any data source configured in your workspace:

```bash
# Show sync command usage
pnpm run sync

# Sync all entities from a data source (use data source ID from web interface)
pnpm run sync <data_source_id>

# Sync specific entity from a data source
pnpm run sync <data_source_id> leads
pnpm run sync <data_source_id> opportunities
pnpm run <data_source_id> customers

# Sync to a different target database
pnpm run sync <data_source_id> --db=<target_database_id>
pnpm run sync <data_source_id> leads --db=<target_database_id>
```

**Note:** Data source IDs are automatically generated when you add data sources through the web interface. You can find these IDs in the Data Sources page.

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
# Run query on default database (automatically uses most recent database)
pnpm run query queries/example.js

# Run query on specific database (use database ID from web interface)
pnpm run query queries/example.js --db=<database_id>
```

**Note:** Database IDs are automatically generated when you add databases through the web interface. You can find these IDs in the Databases page.

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

4. Start the development servers:
   ```bash
   pnpm run dev
   ```

5. Configure your first data source:
   - Open http://localhost:3000 in your browser
   - Navigate to Data Sources and add your first connector
   - Add a target database in the Databases section

6. Start syncing:
   ```bash
   # Replace <data_source_id> with the ID from your web interface
   pnpm run sync <data_source_id>
   pnpm run sync <data_source_id> customers
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

1. Open http://localhost:3000
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

## Sample Analytics Queries

Ready-made queries are available in the `consoles/` folder:

```bash
# Run a specific query
pnpm run query consoles/all/leads_by_closer_by_status.js

# Run query on specific database
pnpm run query consoles/all/opps_created_by_month.js --db=<database_id>
```

Example queries available:

- `consoles/all/leads_by_closer_by_status.js` - Lead distribution by sales rep
- `consoles/all/opps_created_by_month.js` - Opportunity creation trends
- `consoles/all/time_to_close.js` - Sales cycle analysis
- `consoles/all/top_sales_people.js` - Top performer analysis

**Note:** These queries are designed to work with data sources that have been synced through the platform.

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
│   ├── query-runner.ts      # Query execution
│   └── test-sync.ts         # Testing utilities
├── api/                     # Backend API server
│   └── src/
│       ├── connectors/      # Connector implementations
│       │   ├── base/        # Base connector interface
│       │   ├── close/       # Close.com connector
│       │   ├── stripe/      # Stripe connector
│       │   ├── graphql/     # GraphQL connector
│       │   └── registry.ts  # Connector registry
│       ├── routes/          # API endpoints
│       ├── database/        # Database schemas
│       ├── auth/            # Authentication system
│       ├── services/        # Business logic services
│       └── middleware/      # Express middleware
├── app/                     # Frontend React application
│   └── src/
│       ├── components/      # React components
│       ├── pages/           # Page components
│       ├── contexts/        # React contexts
│       ├── hooks/           # Custom React hooks
│       ├── lib/             # Utility libraries
│       └── store/           # State management (Zustand)
├── consoles/                # MongoDB analytics queries
│   ├── all/                 # Cross-workspace queries
│   ├── ch/                  # Switzerland-specific queries
│   ├── es/                  # Spain-specific queries
│   └── it/                  # Italy-specific queries
├── docs/                    # Documentation
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
