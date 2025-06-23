import { DataSourceConfig } from "./database-data-source-manager";
import { BaseConnector } from "../api/src/connectors/base/BaseConnector";

interface ConnectorRegistryEntry {
  type: string;
  connectorClass: any;
  metadata: {
    name: string;
    version: string;
    description: string;
    supportedEntities: string[];
  };
}

/**
 * Connector registry for the sync script
 * Dynamically loads connectors based on connector type
 */
class SyncConnectorRegistry {
  private connectors: Map<string, ConnectorRegistryEntry> = new Map();
  private initialized = false;

  constructor() {
    void this.initializeBuiltInConnectors();
  }

  /**
   * Initialize built-in connectors
   */
  private async initializeBuiltInConnectors() {
    if (this.initialized) return;

    // Dynamically load and register connectors
    try {
      // Close connector
      const closeModule = await import("../api/src/connectors/close");
      const closeConnector = new closeModule.CloseConnector({
        config: {},
      } as any);
      const closeMetadata = closeConnector.getMetadata();

      this.register({
        type: "close",
        connectorClass: closeModule.CloseConnector,
        metadata: closeMetadata,
      });

      // Stripe connector
      const stripeModule = await import("../api/src/connectors/stripe");
      const stripeConnector = new stripeModule.StripeConnector({
        config: {},
      } as any);
      const stripeMetadata = stripeConnector.getMetadata();

      this.register({
        type: "stripe",
        connectorClass: stripeModule.StripeConnector,
        metadata: stripeMetadata,
      });

      // GraphQL connector
      const graphqlModule = await import("../api/src/connectors/graphql");
      const graphqlConnector = new graphqlModule.GraphQLConnector({
        config: { queries: [] },
      } as any);
      const graphqlMetadata = graphqlConnector.getMetadata();

      this.register({
        type: "graphql",
        connectorClass: graphqlModule.GraphQLConnector,
        metadata: graphqlMetadata,
      });
    } catch (error) {
      console.error("Failed to initialize connectors:", error);
      // Continue with static registration as fallback
      this.registerStaticConnectors();
    }

    this.initialized = true;
    console.log(
      `✅ Sync connector registry initialized with ${this.connectors.size} connector types`,
    );
  }

  /**
   * Fallback static registration
   */
  private registerStaticConnectors() {
    this.register({
      type: "close",
      connectorClass: null,
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
      connectorClass: null,
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
      connectorClass: null,
      metadata: {
        name: "GraphQL",
        version: "1.0.0",
        description: "Generic GraphQL API connector",
        supportedEntities: ["custom"],
      },
    });
  }

  /**
   * Register a connector
   */
  register(entry: ConnectorRegistryEntry) {
    this.connectors.set(entry.type, entry);
  }

  /**
   * Get a connector instance for a data source
   */
  async getConnector(
    dataSource: DataSourceConfig,
  ): Promise<BaseConnector | null> {
    const entry = this.connectors.get(dataSource.type);
    if (!entry) {
      return null;
    }

    // Dynamically import the connector if not already loaded
    if (!entry.connectorClass) {
      try {
        let connectorClass;
        switch (dataSource.type) {
          case "close": {
            const closeModule = await import("../api/src/connectors/close");
            connectorClass = closeModule.CloseConnector;
            break;
          }
          case "stripe": {
            const stripeModule = await import("../api/src/connectors/stripe");
            connectorClass = stripeModule.StripeConnector;
            break;
          }
          case "graphql": {
            const graphqlModule = await import("../api/src/connectors/graphql");
            connectorClass = graphqlModule.GraphQLConnector;
            break;
          }
          default:
            throw new Error(`Unknown connector type: ${dataSource.type}`);
        }

        entry.connectorClass = connectorClass;
      } catch (error) {
        console.error(
          `Failed to load connector for ${dataSource.type}:`,
          error,
        );
        return null;
      }
    }

    // Transform the data source to match what the connector expects
    const connectorDataSource = {
      _id: dataSource.id,
      name: dataSource.name,
      type: dataSource.type,
      config: dataSource.connection,
      settings: dataSource.settings,
    };

    return new entry.connectorClass(connectorDataSource);
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

  /**
   * Get supported entities for a connector type
   */
  getSupportedEntities(type: string): string[] {
    const entry = this.connectors.get(type);
    return entry?.metadata.supportedEntities || [];
  }
}

// Export singleton instance
export const syncConnectorRegistry = new SyncConnectorRegistry();
