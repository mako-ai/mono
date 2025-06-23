import { DataSourceConfig } from "./database-data-source-manager";

interface ConnectorRegistryEntry {
  type: string;
  syncServiceClass: any;
  metadata: {
    name: string;
    version: string;
    description: string;
    supportedEntities: string[];
  };
}

/**
 * Simple connector registry for the sync script
 * Dynamically loads sync services based on connector type
 */
class SyncConnectorRegistry {
  private connectors: Map<string, ConnectorRegistryEntry> = new Map();
  private initialized = false;

  constructor() {
    this.initializeBuiltInConnectors();
  }

  /**
   * Initialize built-in connectors
   */
  private initializeBuiltInConnectors() {
    if (this.initialized) return;

    // Register known connector types
    this.register({
      type: "close",
      syncServiceClass: null, // Will be loaded dynamically
      metadata: {
        name: "Close",
        version: "1.0.0",
        description: "Close CRM connector",
        supportedEntities: [
          "leads",
          "opportunities",
          "activities",
          "contacts",
          "users",
          "custom_fields",
        ],
      },
    });

    this.register({
      type: "stripe",
      syncServiceClass: null, // Will be loaded dynamically
      metadata: {
        name: "Stripe",
        version: "1.0.0",
        description: "Stripe payment platform connector",
        supportedEntities: [
          "customers",
          "subscriptions",
          "charges",
          "invoices",
          "products",
          "plans",
        ],
      },
    });

    this.register({
      type: "graphql",
      syncServiceClass: null, // Will be loaded dynamically
      metadata: {
        name: "GraphQL",
        version: "1.0.0",
        description: "Generic GraphQL API connector",
        supportedEntities: ["custom"],
      },
    });

    this.initialized = true;
    console.log(
      `✅ Sync connector registry initialized with ${this.connectors.size} connector types`,
    );
  }

  /**
   * Register a connector
   */
  register(entry: ConnectorRegistryEntry) {
    this.connectors.set(entry.type, entry);
  }

  /**
   * Get a sync service instance for a data source
   */
  async getSyncService(dataSource: DataSourceConfig): Promise<any | null> {
    const entry = this.connectors.get(dataSource.type);
    if (!entry) {
      return null;
    }

    // Dynamically import the sync service if not already loaded
    if (!entry.syncServiceClass) {
      try {
        let syncServiceClass;
        switch (dataSource.type) {
          case "close": {
            const closeModule = await import("../api/src/connectors/close");
            syncServiceClass = closeModule.CloseSyncService;
            break;
          }
          case "stripe": {
            const stripeModule = await import("../api/src/connectors/stripe");
            syncServiceClass = stripeModule.StripeSyncService;
            break;
          }
          case "graphql": {
            const graphqlModule = await import("../api/src/connectors/graphql");
            syncServiceClass = graphqlModule.GraphQLSyncService;
            break;
          }
          default:
            throw new Error(`Unknown connector type: ${dataSource.type}`);
        }

        entry.syncServiceClass = syncServiceClass;
      } catch (error) {
        console.error(
          `Failed to load sync service for ${dataSource.type}:`,
          error,
        );
        return null;
      }
    }

    return new entry.syncServiceClass(dataSource);
  }

  /**
   * Check if a connector type is registered
   */
  hasConnector(type: string): boolean {
    return this.connectors.has(type);
  }

  /**
   * Get all available connector types
   */
  getAvailableTypes(): string[] {
    return Array.from(this.connectors.keys());
  }

  /**
   * Get metadata for a connector type
   */
  getMetadata(type: string): ConnectorRegistryEntry | null {
    return this.connectors.get(type) || null;
  }
}

// Export singleton instance
export const syncConnectorRegistry = new SyncConnectorRegistry();
