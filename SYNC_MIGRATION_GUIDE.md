# Sync Scripts Migration Guide

Your sync scripts have been successfully updated to work with database-based connectors instead of config files.

## What Changed

### Before (Config File-Based)

- Data sources were configured in `config/config.yaml`
- Sync scripts read configuration from YAML files
- Limited to static configuration

### After (Database-Based)

- Data sources are stored in MongoDB database (`datasources` collection)
- Sync scripts read configuration from database using `databaseDataSourceManager`
- Dynamic configuration through your web application
- Encrypted sensitive data (API keys, passwords)

## Updated Files

### `src/sync.ts`

- Now uses `databaseDataSourceManager` to get data sources from database
- Supports both data source ID and name lookup
- Enhanced error handling and user feedback
- Maintains backward compatibility with existing sync service classes

### `src/sync-stripe.ts`

- Updated sync methods to handle database-provided target database objects
- Backward compatibility for both `targetDb` objects and `targetDbId` strings
- Enhanced connection handling
- **NEW**: Staging + Hot Swap functionality for full syncs
  - Creates temporary staging collections during full sync
  - Performs atomic hot swap when sync completes successfully
  - Enables detection of deleted records
  - Zero-downtime updates with automatic rollback on failure

### `src/test-sync.ts` (New)

- Test script to verify database connectivity and data source availability
- Helps troubleshoot configuration issues

## How to Use

### 1. Test Your Setup

```bash
# Run the test script to verify everything is working
pnpm run ts-node src/test-sync.ts
```

### 2. List Available Data Sources

The test script will show you all available data sources and their IDs.

### 3. Run Sync Operations

#### Sync All Entities

```bash
pnpm run sync <source_id> <destination>
```

#### Sync Specific Entity

```bash
pnpm run sync <source_id> <destination> <entity>
```

### Examples

#### Stripe Sync

```bash
# Full sync with staging + hot swap (recommended for production)
pnpm run sync "507f1f77bcf86cd799439011" RevOps --full

# Direct sync all entities (upsert mode)
pnpm run sync "507f1f77bcf86cd799439011" RevOps

# Full sync customers only with staging + hot swap
pnpm run sync "507f1f77bcf86cd799439011" RevOps customers --full

# Direct sync customers only (upsert mode)
pnpm run sync "507f1f77bcf86cd799439011" RevOps customers

# Other available entities: subscriptions, charges, invoices, products, plans
```

#### Close.com Sync

```bash
# Full sync with staging + hot swap
pnpm run sync "507f1f77bcf86cd799439012" RevOps --full

# Direct sync all entities
pnpm run sync "507f1f77bcf86cd799439012" RevOps

# Full sync leads only with staging + hot swap (falls back to direct for now)
pnpm run sync "507f1f77bcf86cd799439012" RevOps leads --full

# Direct sync leads only
pnpm run sync "507f1f77bcf86cd799439012" RevOps leads

# Other available entities: opportunities, activities, contacts, users, custom_fields
```

#### GraphQL Sync

```bash
# Full sync all configured queries
pnpm run sync "507f1f77bcf86cd799439013" RevOps --full

# Direct sync all configured queries
pnpm run sync "507f1f77bcf86cd799439013" RevOps

# Full sync specific query with staging + hot swap (falls back to direct for now)
pnpm run sync "507f1f77bcf86cd799439013" RevOps teams --full

# Direct sync specific query by name
pnpm run sync "507f1f77bcf86cd799439013" RevOps teams
```

## New Features

### 🔄 Staging + Hot Swap with --full Flag

When using the **--full flag**, the system uses a staging + hot swap approach:

#### How It Works:

1. **Staging Phase**: All data is synced to temporary staging collections

   - `it_stripe_customers_staging_1734567890`
   - `it_stripe_subscriptions_staging_1734567890`
   - etc.

2. **Hot Swap Phase**: Once all entities are successfully synced:
   - Current collections → backup collections (`it_stripe_customers_backup_1734567890`)
   - Staging collections → current collections (`it_stripe_customers`)
   - Backup collections are automatically cleaned up after 1 minute

#### Benefits:

- **🔍 Deletion Detection**: Compare old vs new collections to see what was deleted
- **⚡ Zero Downtime**: Atomic swap ensures no service interruption
- **🛡️ Safety**: Automatic rollback if any sync fails
- **📊 Data Integrity**: Either all entities sync successfully or none do

#### Collection Naming:

- **Target Collections**: `it_stripe_customers`, `it_stripe_subscriptions`
- **Staging Collections**: `it_stripe_customers_staging_1734567890`
- **Backup Collections**: `it_stripe_customers_backup_1734567890`

### 📝 Human-Readable Collection Names

Collections are now named based on your data source name instead of MongoDB ObjectIds:

- **Before**: `684aa9a13592a9b16566b305_subscriptions`
- **After**: `it_stripe_subscriptions`

The system automatically converts data source names to collection-safe identifiers:

- "Italy Stripe Payments" → `italy_stripe_payments_customers`
- "CH-Stripe-2024" → `ch_stripe_2024_customers`

### 🎛️ Sync Mode Options

The sync system has **two dimensions** for control:

#### Sync Method (--full flag)

- **`--full`**: Staging + hot swap (enables deletion detection)
- **No flag**: Direct upserts (faster, incremental)

#### Scope (entity specification)

- **Entity specified**: Sync only that entity
- **No entity**: Sync all entities

#### All Combinations:

**1. Full Sync All Entities**

```bash
pnpm run sync it_stripe RevOps --full
```

- ✅ **Zero downtime** - atomic hot swap for all entities
- ✅ **Deletion detection** - compare old vs new collections
- ✅ **Data integrity** - all entities sync or none do
- ⚠️ **Slower** - requires extra disk space and time

**2. Full Sync Single Entity**

```bash
pnpm run sync it_stripe RevOps customers --full
```

- ✅ **Zero downtime** - atomic hot swap for that entity
- ✅ **Deletion detection** - for that specific entity
- ✅ **Faster than full** - only one entity uses staging
- ✅ **Safe** - rollback if entity sync fails

**3. Direct Sync All Entities**

```bash
pnpm run sync it_stripe RevOps
```

- ✅ **Fast** - direct upserts to all collections
- ✅ **Incremental** - adds new records, updates existing
- ❌ **No deletion detection** - deleted records remain
- ❌ **Potential downtime** - collections updated in real-time

**4. Direct Sync Single Entity**

```bash
pnpm run sync it_stripe RevOps customers
```

- ✅ **Fastest** - direct upsert to one collection only
- ✅ **Incremental** - updates that entity only
- ❌ **No deletion detection** - for that entity
- ✅ **Minimal impact** - only affects one collection

**💡 Recommendations**:

- **Production**: Use `--full` (with or without entity)
- **Development**: Use direct sync for speed
- **Deletion Detection**: Always use `--full` flag

## Environment Variables Required

Make sure these environment variables are set:

```env
DATABASE_URL=mongodb://your-connection-string
ENCRYPTION_KEY=your-32-character-hex-encryption-key
```

## Data Source Management

### Creating Data Sources

Data sources are now created through your web application interface. The app will:

- Store the configuration in the `datasources` collection
- Encrypt sensitive fields (API keys, passwords)
- Set appropriate sync settings

### Database Schema

Data sources are stored with this structure:

```javascript
{
  _id: ObjectId,
  name: "Data Source Name",
  type: "stripe" | "close" | "graphql",
  isActive: true,
  config: {
    api_key: "encrypted_value",
    // ... other configuration
  },
  settings: {
    sync_batch_size: 100,
    rate_limit_delay_ms: 200,
    // ... other settings
  }
}
```

### Destination Databases

Destination databases are stored in the `databases` collection:

```javascript
{
  _id: ObjectId,
  name: "RevOps",
  connection: {
    connectionString: "encrypted_connection_string",
    database: "encrypted_database_name"
  }
}
```

## Troubleshooting

### Common Issues

1. **"Data source not found"**

   - Run the test script to see available data sources
   - Check that the data source is active in your database

2. **"Destination database not found"**

   - Make sure the destination database exists in the `databases` collection
   - Check the database name is correct

3. **Connection errors**

   - Verify `DATABASE_URL` and `ENCRYPTION_KEY` environment variables
   - Test database connectivity

4. **Decryption errors**
   - Ensure `ENCRYPTION_KEY` matches the key used to encrypt the data
   - Check that sensitive fields are properly encrypted

### Debug Commands

```bash
# Test database connectivity and list data sources
pnpm run ts-node src/test-sync.ts

# Check specific data source
pnpm run sync <source_id> --dry-run  # (if you add this flag)
```

## Migration Checklist

- [x] Updated sync scripts to use database configuration
- [x] Created test script for verification
- [x] Maintained backward compatibility
- [x] Enhanced error handling
- [ ] Verify all data sources are created in database
- [ ] Test sync operations with actual data
- [ ] Update any CI/CD scripts to use new data source IDs

## Next Steps

1. Run the test script to verify setup
2. Create your data sources through the web application
3. Test sync operations with small datasets first
4. Update any automation scripts to use the new data source IDs

The sync functionality is now more robust, secure, and manageable through your web interface!
