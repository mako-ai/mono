# Database Migration: Config File to MongoDB

## Overview

This document describes the migration of database connections from a YAML config file to MongoDB storage. This migration enables multi-tenant workspace support and secure credential management.

## Migration Status

✅ **Completed Components:**
- Migration script created (`scripts/migrate-databases-to-mongodb.ts`)
- Database routes updated to read from MongoDB
- Workspace-based filtering implemented
- Connection encryption/decryption working
- Package scripts added for migration

## Running the Migration

### Prerequisites

1. Ensure you have the `ENCRYPTION_KEY` environment variable set:
   ```bash
   export ENCRYPTION_KEY=$(openssl rand -hex 32)
   ```
   Add this to your `.env` file for persistence.

2. Ensure MongoDB is running and `DATABASE_URL` is set in your `.env` file.

3. Set any environment variables referenced in your config file (e.g., `MONGO_ATLAS_PASSWORD`).

### Migration Steps

1. **Dry Run** - Preview what will be migrated:
   ```bash
   pnpm migrate:databases:dry
   ```

2. **Run Migration** - Execute the actual migration:
   ```bash
   pnpm migrate:databases
   ```

3. **Verify Migration** - Check that databases appear in the application UI and test connections.

## What Gets Migrated

The migration script reads from `config/config.yaml` and migrates:

- MongoDB servers and their databases
- Connection strings (with environment variable substitution)
- Database names and descriptions
- Active/inactive status

### Data Transformation

- **Connection strings** are parsed to extract individual components (host, port, username, password)
- **Sensitive data** (passwords, connection strings, usernames) are encrypted using AES-256-CBC
- **MongoDB Atlas** connections (mongodb+srv://) are stored as full connection strings
- Each database is assigned to a workspace (default workspace or first available)

## Post-Migration Steps

### 1. Update Application Code

The following routes have been updated to use MongoDB:
- `/api/databases` - Lists all databases for the workspace
- `/api/databases/servers` - Legacy endpoint for backward compatibility
- `/api/databases/:id/collections` - Lists collections in a database
- `/api/databases/:id/views` - Lists views in a database
- `/api/databases/:id/test` - Tests database connection
- `/api/databases/:id/query` - Executes queries on a database

### 2. Clean Up Config File

After successful migration and testing:

1. Comment out or remove the `mongodb_servers` section from `config/config.yaml`
2. Keep other configuration sections that are still in use

### 3. Environment Variables

Ensure these environment variables are set:
- `ENCRYPTION_KEY` - 32-byte hex string for encrypting credentials
- `DATABASE_URL` - MongoDB connection string for the application database
- Any variables referenced in your config file (e.g., `MONGO_ATLAS_PASSWORD`)

## Security Considerations

1. **Encryption**: All sensitive fields are encrypted before storage
2. **Workspace Isolation**: Databases are scoped to workspaces
3. **Access Control**: Only workspace members can access databases
4. **Connection Strings**: Never exposed in API responses (decrypted only when establishing connections)

## Rollback Plan

If you need to rollback:

1. The config file is not modified by the migration
2. You can switch back to config-based connections by reverting the code changes
3. Database documents can be manually removed from MongoDB if needed

## Troubleshooting

### Common Issues

1. **"Environment variable X is not set"**
   - Ensure all variables referenced in config.yaml are set in your environment

2. **"No workspace found"**
   - The migration creates a default workspace if none exists
   - Ensure the migration user has proper permissions

3. **"Failed to connect to MongoDB"**
   - Check your DATABASE_URL environment variable
   - Ensure MongoDB is running and accessible

4. **"Failed to parse connection string"**
   - Complex connection strings are stored as-is
   - The warning can be ignored if connections work

### Debug Mode

Set environment variable for verbose logging:
```bash
DEBUG=true pnpm migrate:databases
```

## API Changes

### Before (Config-based)
```javascript
// Databases identified by: serverId.databaseId
GET /api/databases/atlas.revops/collections
```

### After (MongoDB-based)
```javascript
// Databases identified by MongoDB ObjectId
GET /api/databases/507f1f77bcf86cd799439011/collections
```

## Future Enhancements

1. **Migration UI**: Web interface for managing database migrations
2. **Bulk Operations**: Import/export database configurations
3. **Connection Pooling**: Optimize connection management
4. **SSH Tunnel Support**: Add SSH tunnel configuration UI
5. **Non-MongoDB Databases**: Extend support for PostgreSQL, MySQL, etc.