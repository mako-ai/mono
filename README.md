# Close.com Analytics

A local analytics tool for Close.com CRM data using MongoDB for complex querying and analysis.

## Features

- Full data sync from Close.com API to local MongoDB
- Rate limiting and retry logic for API reliability
- Atomic collection swapping for zero-downtime updates
- MongoDB aggregation queries for business analytics
- Local development environment with Docker

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Node.js 18+ and pnpm
- Close.com API key

### Setup

1. **Clone and install dependencies:**

   ```bash
   git clone <your-repo>
   cd close-analytics
   pnpm install
   ```

2. **Configure environment:**

   ```bash
   cp .env.example .env
   # Edit .env and add your Close.com API key
   ```

3. **Start MongoDB:**

   ```bash
   npm run docker:up
   ```

4. **Sync your first data:**

   ```bash
   pnpm run sync:leads
   ```

5. **Access MongoDB UI:**
   Open http://localhost:8082 to browse your data with Mongo Express

## Configuration

### Environment Variables

| Variable                  | Description                     | Default                                     |
| ------------------------- | ------------------------------- | ------------------------------------------- |
| `CLOSE_API_KEY`           | Your Close.com API key          | Required                                    |
| `CLOSE_API_BASE_URL`      | Close.com API base URL          | `https://api.close.com/api/v1`              |
| `MONGO_CONNECTION_STRING` | MongoDB connection string       | `mongodb://localhost:27018/close_analytics` |
| `RATE_LIMIT_DELAY_MS`     | Delay between API requests      | `200`                                       |
| `MAX_RETRIES`             | Max retries for failed requests | `5`                                         |
| `BATCH_SIZE`              | Records per API request         | `100`                                       |

### Getting Your Close.com API Key

1. Log into your Close.com account
2. Go to Settings → API Keys
3. Create a new API key with read permissions
4. Copy the key to your `.env` file

## Usage

### Syncing Data

```bash
# Sync leads only
pnpm run sync:leads

# Sync all data types (when implemented)
pnpm run sync:all
```

### Docker Commands

```bash
# Start MongoDB containers
pnpm run docker:up

# Stop containers
pnpm run docker:down

# View logs
pnpm run docker:logs

# Full reset (removes all data)
docker compose down -v
```

### Development

```bash
# Build TypeScript
pnpm run build

# Run in development mode
pnpm run dev
```

## Data Structure

The sync process creates these MongoDB collections:

- `leads` - Current lead data
- `leads_staging` - Temporary collection used during sync

### Atomic Updates

The sync process uses a staging approach to ensure data consistency:

1. Downloads all data to `leads_staging`
2. Swaps collections atomically
3. Drops the old collection

This ensures your queries never see partial data.

## Querying Data

### Using Mongo Express

1. Open http://localhost:8082
2. Navigate to `close_analytics` database
3. Browse collections and run queries

### Using MongoDB Compass

Connect to: `mongodb://localhost:27018/close_analytics`

### Command Line

```bash
# Connect to MongoDB container
docker exec -it close-analytics-mongo mongosh close_analytics

# Example query
db.leads.find({status_id: "lead_status_xyz"}).count()
```

## Sample Analytics Queries

Ready-made queries will be available in the `queries/` folder for:

- Sales by salesperson by month
- Average time to close by salesperson
- Open opportunities by salesperson
- Stale opportunities analysis

## Troubleshooting

### Common Issues

**API Rate Limiting:**

- Increase `RATE_LIMIT_DELAY_MS` in `.env`
- The sync will automatically retry with exponential backoff

**MongoDB Connection Issues:**

- Ensure Docker containers are running: `npm run docker:up`
- Check logs: `npm run docker:logs`

**Large Dataset Sync:**

- The process handles 50k+ records automatically
- Monitor progress in console output
- Sync typically takes 10-20 minutes for 50k records

### Performance Tips

- Run syncs during off-hours to avoid API limits
- Use `BATCH_SIZE=100` for optimal performance
- Monitor memory usage for very large datasets

## Project Structure

```
close-analytics/
├── src/
│   ├── sync-leads.ts      # Leads sync script
│   └── index.ts           # Main entry point
├── scripts/
│   └── init-mongo.js      # MongoDB initialization
├── queries/               # Ready-made analytics queries
├── docker-compose.yml     # Docker configuration
├── .env                   # Environment variables
└── package.json          # Node.js dependencies
```

## Next Steps

- [ ] Add opportunities sync
- [ ] Add contacts sync
- [ ] Create analytics query library
- [ ] Add data export utilities
- [ ] Add scheduling with cron jobs

## Support

For Close.com API documentation: https://developer.close.com/
For MongoDB queries: https://docs.mongodb.com/manual/tutorial/query-documents/
