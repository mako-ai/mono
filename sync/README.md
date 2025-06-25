# Data Sync Tool

A powerful command-line tool for syncing data from various sources (Stripe, Close CRM, GraphQL APIs) to destination databases. The tool supports both interactive and command-line modes, making it easy for both beginners and power users.

## Features

- 🚀 **Interactive Mode**: Step-by-step guided sync process
- ⚡ **Command-Line Mode**: Direct execution with arguments
- 🔄 **Multiple Sync Modes**: Full sync or incremental updates
- 📊 **Real-time Progress**: Visual progress bars during sync
- 🔐 **Secure**: Encrypted credentials and connection strings
- 🎯 **Flexible**: Sync all entities or specific ones

## Installation

The sync tool is already included in this workspace. Ensure you have the required environment variables set:

```bash
DATABASE_URL=your_database_url
ENCRYPTION_KEY=your_encryption_key
```

## Usage

### Interactive Mode (Recommended for beginners)

Simply run the sync command without any arguments:

```bash
pnpm run sync
```

Or explicitly use the interactive flag:

```bash
pnpm run sync --interactive
# or
pnpm run sync -i
```

The interactive mode will guide you through:
1. **Select a data source** - Choose from your configured sources
2. **Select a destination** - Pick where to sync the data
3. **Choose entities** - Select all or specific entities to sync
4. **Pick sync mode** - Full sync or incremental update
5. **Confirm** - Review and confirm your selections

### Command-Line Mode (For automation and scripts)

```bash
pnpm run sync [source] [destination] [entity] [options]
```

#### Arguments:
- `source` - Name or ID of the data source
- `destination` - Name or ID of the destination database
- `entity` (optional) - Specific entity to sync

#### Options:
- `--incremental`, `--inc` - Perform incremental sync
- `--interactive`, `-i` - Force interactive mode
- `--help`, `-h` - Show help information
- `--version`, `-V` - Show version

### Examples

#### Interactive Mode Examples

```bash
# Start interactive mode
pnpm run sync

# Force interactive mode even with arguments
pnpm run sync --interactive
```

#### Command-Line Mode Examples

```bash
# Sync all entities from Stripe to analytics database
pnpm run sync "Stripe Production" "Analytics DB"

# Sync only customers from Stripe
pnpm run sync stripe-prod analytics-db customers

# Incremental sync of leads from Close CRM
pnpm run sync close-crm reporting-db leads --incremental

# Sync GraphQL data with incremental mode
pnpm run sync graphql-api warehouse --inc
```

## Supported Data Sources

### Stripe
- **Entities**: customers, subscriptions, charges, invoices, products, plans
- **Features**: Full and incremental sync support

### Close CRM
- **Entities**: leads, opportunities, activities, contacts, users, custom_fields
- **Features**: Full and incremental sync support

### GraphQL
- **Entities**: Custom queries defined in configuration
- **Features**: Flexible query-based syncing

## Sync Modes

### Full Sync
- Replaces all data in the destination
- Ensures complete data consistency
- Best for initial syncs or data corrections

### Incremental Sync
- Only syncs new or updated records
- Faster for regular updates
- Preserves existing data

## Demo Mode

To see the interactive sync in action without connecting to real databases:

```bash
ts-node sync/demo-interactive.ts
```

## Troubleshooting

### Environment Variables Not Set
If you see errors about missing DATABASE_URL or ENCRYPTION_KEY:
1. Create a `.env` file in the project root
2. Add the required variables
3. Run `source .env` or restart your terminal

### No Data Sources Found
This means no data sources are configured in your database:
1. Use the web application to create data sources
2. Ensure they are marked as active
3. Try running the sync again

### Connection Errors
If the sync fails to connect:
1. Verify your data source credentials
2. Check network connectivity
3. Ensure the source API is accessible

## Best Practices

1. **Test First**: Always test with a single entity before doing a full sync
2. **Use Incremental**: For regular syncs, use incremental mode to save time
3. **Monitor Progress**: Watch the progress bars to ensure sync is proceeding
4. **Check Logs**: Review output for any warnings or errors
5. **Backup First**: For production data, ensure you have backups before full syncs

## Development

### Adding New Connectors

To add support for a new data source:
1. Create a new connector in `/api/src/connectors/`
2. Extend the `BaseConnector` class
3. Implement required methods
4. Register in the connector registry

### Testing

```bash
# Run the test sync script
pnpm run test:sync

# Run the interactive demo
ts-node sync/demo-interactive.ts
```

## Support

For issues or questions:
1. Check the logs for detailed error messages
2. Verify your configuration and credentials
3. Ensure all required environment variables are set
4. Review the source code in `/sync/` directory