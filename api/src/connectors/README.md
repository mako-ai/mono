# Data Source Connectors

This directory contains the connector architecture for integrating various data sources into the platform.

## Architecture Overview

The connector system is designed to be extensible, allowing easy addition of new data source types. Each connector implements a common interface defined in `BaseConnector`.

### Directory Structure

```
connectors/
├── base/
│   └── BaseConnector.ts    # Abstract base class for all connectors
├── stripe/
│   └── StripeConnector.ts  # Stripe payment platform connector
├── close/
│   └── CloseConnector.ts   # Close CRM connector
├── graphql/
│   └── GraphQLConnector.ts # Generic GraphQL API connector
├── registry.ts             # Connector registry and management
└── README.md              # This file
```

## Creating a New Connector

To add support for a new data source type:

1. Create a new directory for your connector (e.g., `salesforce/`)
2. Create a connector class that extends `BaseConnector`
3. Implement all required methods
4. Register your connector in `registry.ts`

### Example Connector Implementation

```typescript
import {
  BaseConnector,
  ConnectionTestResult,
  SyncOptions,
} from "../base/BaseConnector";

export class MyConnector extends BaseConnector {
  getMetadata() {
    return {
      name: "My Data Source",
      version: "1.0.0",
      description: "Connector for My Data Source",
      supportedEntities: ["entity1", "entity2"],
    };
  }

  async testConnection(): Promise<ConnectionTestResult> {
    // Implement connection test logic
    return {
      success: true,
      message: "Connection successful",
    };
  }

  getAvailableEntities(): string[] {
    return ["entity1", "entity2"];
  }

  async syncAll(options: SyncOptions): Promise<void> {
    // Implement sync logic for all entities
  }

  async syncEntity(entity: string, options: SyncOptions): Promise<void> {
    // Implement sync logic for specific entity
  }
}
```

### Registering Your Connector

Add your connector to the registry in `registry.ts`:

```typescript
// Import your connector
import { MyConnector } from "./my-connector/MyConnector";

// In registerBuiltInConnectors method:
this.register({
  type: "myconnector",
  connector: MyConnector,
  metadata: {
    name: "My Data Source",
    version: "1.0.0",
    description: "Connector for My Data Source",
    supportedEntities: ["entity1", "entity2"],
  },
});
```

## Configuration

Data sources are stored in the database with encrypted credentials. Each data source has:

- **config**: Connection configuration (API keys, endpoints, etc.)
- **settings**: Sync settings (batch size, rate limits, etc.)
- **targetDatabases**: Target databases for syncing data

## Security

All sensitive configuration data (API keys, passwords, etc.) is encrypted before storage using AES-256-CBC encryption. The encryption key must be set in the `ENCRYPTION_KEY` environment variable.

## Available Connectors

### Stripe

- Syncs payment data from Stripe
- Supported entities: customers, subscriptions, charges, invoices, products, plans
- Required config: `api_key`

### Close

- Syncs CRM data from Close
- Supported entities: leads, opportunities, activities, contacts, users, custom_fields
- Required config: `api_key`

### GraphQL

- Generic GraphQL API connector
- Supports custom queries with pagination
- Required config: `endpoint`, `queries`

## Future Connectors

The architecture supports easy addition of new connectors such as:

- Salesforce
- HubSpot
- PostgreSQL/MySQL (direct database connections)
- REST APIs
- Webhooks
- CSV imports

## Contributing

When contributing a new connector:

1. Follow the existing patterns and interfaces
2. Include comprehensive error handling
3. Implement rate limiting and retry logic
4. Add tests for your connector
5. Update this README with connector details
