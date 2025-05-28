# Data Sources Management

This feature allows you to manage your data sources from the web interface instead of the `tenants.yaml` file.

## Migration from tenants.yaml

To migrate your existing data sources from `config/tenants.yaml` to the database:

```bash
# Ensure MongoDB is running
pnpm run docker:up

# Run the migration script
pnpm run migrate:tenants
```

This will:

- Read your current `tenants.yaml` file
- Create data source records in the MongoDB `data_sources` collection
- Preserve tenant associations and settings

## Features

### Data Source Types Supported:

- **Close CRM** - Requires API key
- **Stripe** - Requires API key
- **PostgreSQL** - Requires host, database, username, password
- **MySQL** - Requires host, database, username, password
- **GraphQL API** - Requires base URL, optional API key/auth
- **REST API** - Requires base URL, optional API key/auth
- **Generic API** - Requires base URL, optional API key/auth

### Management Operations:

- ✅ **Create** new data sources
- ✅ **Read/List** all data sources
- ✅ **Update** existing data sources
- ✅ **Delete** data sources
- ✅ **Enable/Disable** data sources
- ✅ **Test Connection** - Basic validation

### Configuration Options:

- **Basic Info**: Name, description, source type
- **Connection**: API keys, URLs, database credentials
- **Settings**: Batch size, rate limiting, retries, timeouts
- **Tenant Association**: Optional tenant assignment

## API Endpoints

The backend provides REST API endpoints for data source management:

```
GET    /api/sources          # List all data sources
GET    /api/sources/:id      # Get specific data source
POST   /api/sources          # Create new data source
PUT    /api/sources/:id      # Update existing data source
DELETE /api/sources/:id      # Delete data source
POST   /api/sources/:id/test # Test connection
PATCH  /api/sources/:id/enable # Enable/disable data source
```

## Database Schema

Data sources are stored in the `data_sources` collection with this structure:

```javascript
{
  _id: ObjectId,
  name: String,               // Required: Display name
  description: String,        // Optional: Description
  source: String,            // Required: Type (close, stripe, postgres, etc.)
  enabled: Boolean,          // Required: Whether source is active
  config: {                  // Connection configuration
    api_key: String,         // For API-based sources
    api_base_url: String,    // For API-based sources
    host: String,            // For database sources
    port: Number,            // For database sources
    database: String,        // For database sources
    username: String,        // For database sources
    password: String         // For database sources (encrypted in production)
  },
  settings: {                // Sync settings
    sync_batch_size: Number,      // Default: 100
    rate_limit_delay_ms: Number,  // Default: 200
    max_retries: Number,          // Default: 3
    timeout_ms: Number            // Default: 30000
  },
  tenant: String,            // Optional: Tenant association
  created_at: Date,
  updated_at: Date
}
```

## Web Interface

Navigate to `/sources` in your web application to:

1. **View all data sources** in a card-based layout
2. **Add new data sources** with the "Add Data Source" button
3. **Edit data sources** using the edit icon on each card
4. **Enable/disable** sources with the toggle button
5. **Test connections** to validate configurations
6. **Delete sources** with confirmation dialog

The interface shows:

- Source type with color-coded chips
- Enable/disabled status
- Tenant association (if any)
- Quick settings overview (batch size, rate limit)
- Action buttons for all operations

## Security Notes

⚠️ **Important**: API keys and passwords are stored in plain text in the database. In a production environment, you should:

1. Encrypt sensitive configuration values
2. Use environment variables for API keys when possible
3. Implement proper access controls
4. Consider using secret management solutions (HashiCorp Vault, AWS Secrets Manager, etc.)

## Migration Benefits

Moving from `tenants.yaml` to database storage provides:

- ✅ **Runtime management** - No need to restart services
- ✅ **Web interface** - User-friendly management
- ✅ **Audit trail** - Track changes with timestamps
- ✅ **Validation** - Built-in form validation and connection testing
- ✅ **Scalability** - Better for large numbers of data sources
- ✅ **Multi-user** - Multiple users can manage sources simultaneously

## Next Steps

After migrating, you can:

1. Remove data source configurations from `tenants.yaml`
2. Update your sync scripts to read from the database instead
3. Build additional features like sync scheduling, monitoring, etc.
4. Implement proper encryption for sensitive configuration values
