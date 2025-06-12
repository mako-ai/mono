import { BaseConnector } from "./base/BaseConnector";
import { IDataSource } from "../database/workspace-schema";

// Import individual connectors
import { StripeConnector } from "./stripe/StripeConnector";
import { CloseConnector } from "./close/CloseConnector";
import { GraphQLConnector } from "./graphql/GraphQLConnector";

// Type for connector constructor
type ConnectorConstructor = new (dataSource: IDataSource) => BaseConnector;

// Updated metadata interface
interface ConnectorRegistryMetadata {
  type: string;
  connector: ConnectorConstructor;
  metadata: {
    name: string;
    version: string;
    description: string;
    author?: string;
    supportedEntities: string[];
  };
}

/**
 * Connector Registry
 * Manages all available data source connectors
 */
class ConnectorRegistry {
  private connectors: Map<string, ConnectorRegistryMetadata> = new Map();

  constructor() {
    this.registerBuiltInConnectors();
  }

  /**
   * Register built-in connectors
   */
  private registerBuiltInConnectors() {
    // Register Stripe connector
    this.register({
      type: "stripe",
      connector: StripeConnector,
      metadata: {
        name: "Stripe",
        version: "1.0.0",
        description: "Connector for Stripe payment platform",
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

    // Register Close connector
    this.register({
      type: "close",
      connector: CloseConnector,
      metadata: {
        name: "Close",
        version: "1.0.0",
        description: "Connector for Close CRM",
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

    // Register GraphQL connector
    this.register({
      type: "graphql",
      connector: GraphQLConnector,
      metadata: {
        name: "GraphQL",
        version: "1.0.0",
        description: "Generic GraphQL API connector",
        supportedEntities: ["custom"], // GraphQL uses custom queries
      },
    });
  }

  /**
   * Register a new connector
   */
  register(metadata: ConnectorRegistryMetadata) {
    this.connectors.set(metadata.type, metadata);
  }

  /**
   * Get a connector instance for a data source
   */
  getConnector(dataSource: IDataSource): BaseConnector | null {
    const metadata = this.connectors.get(dataSource.type);
    if (!metadata) {
      return null;
    }

    const ConnectorClass = metadata.connector;
    return new ConnectorClass(dataSource);
  }

  /**
   * Get all registered connector types
   */
  getAvailableTypes(): string[] {
    return Array.from(this.connectors.keys());
  }

  /**
   * Get metadata for a connector type
   */
  getMetadata(type: string): ConnectorRegistryMetadata | null {
    return this.connectors.get(type) || null;
  }

  /**
   * Get all connector metadata
   */
  getAllMetadata(): ConnectorRegistryMetadata[] {
    return Array.from(this.connectors.values());
  }

  /**
   * Check if a connector type is registered
   */
  hasConnector(type: string): boolean {
    return this.connectors.has(type);
  }
}

// Export singleton instance
export const connectorRegistry = new ConnectorRegistry();

// Export class for testing
export { ConnectorRegistry };
