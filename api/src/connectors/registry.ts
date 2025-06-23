import { BaseConnector } from "./base/BaseConnector";
import { IDataSource } from "../database/workspace-schema";
import * as fs from "fs";
import * as path from "path";

// Type for connector constructor
type ConnectorConstructor = new (dataSource: IDataSource) => BaseConnector;

// Updated metadata interface
interface ConnectorRegistryMetadata {
  type: string;
  connector: ConnectorConstructor;
  syncService: any; // Dynamic sync service class
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
 * Dynamically discovers and manages all available data source connectors
 */
class ConnectorRegistry {
  private connectors: Map<string, ConnectorRegistryMetadata> = new Map();
  private initialized = false;

  constructor() {
    void this.initializeConnectors();
  }

  /**
   * Dynamically discover and register connectors by scanning the connectors directory
   */
  private async initializeConnectors() {
    if (this.initialized) return;

    const connectorsDir = __dirname;
    
    try {
      // Get all subdirectories (potential connector folders)
      const entries = fs.readdirSync(connectorsDir, { withFileTypes: true });
      const connectorDirs = entries
        .filter(entry => entry.isDirectory() && entry.name !== "base")
        .map(entry => entry.name);

      console.log(`🔍 Discovering connectors in: ${connectorsDir}`);
      console.log(`📁 Found potential connector directories: ${connectorDirs.join(", ")}`);

      for (const dirName of connectorDirs) {
        try {
          await this.loadConnector(dirName);
        } catch (error) {
          console.warn(`⚠️  Failed to load connector from ${dirName}:`, error);
        }
      }

      this.initialized = true;
      console.log(`✅ Connector registry initialized with ${this.connectors.size} connectors`);
    } catch (error) {
      console.error("❌ Failed to initialize connector registry:", error);
    }
  }

  /**
   * Load a connector from a directory
   */
  private async loadConnector(dirName: string) {
    const connectorPath = path.join(__dirname, dirName);
    
    // Check if index.ts/js exists
    const indexFiles = ["index.ts", "index.js"];
    let indexFile = null;
    
    for (const file of indexFiles) {
      const filePath = path.join(connectorPath, file);
      if (fs.existsSync(filePath)) {
        indexFile = filePath;
        break;
      }
    }

    if (!indexFile) {
      console.warn(`⚠️  No index file found for connector: ${dirName}`);
      return;
    }

    try {
      // Dynamically import the connector
      const connectorModule = await import(`./${dirName}`);
      
      // Look for the connector class (should follow naming convention)
      const expectedConnectorName = dirName.charAt(0).toUpperCase() + dirName.slice(1) + "Connector";
      const expectedSyncServiceName = dirName.charAt(0).toUpperCase() + dirName.slice(1) + "SyncService";
      
      const ConnectorClass = connectorModule[expectedConnectorName];
      const SyncServiceClass = connectorModule[expectedSyncServiceName];

      if (!ConnectorClass) {
        console.warn(`⚠️  No connector class found for ${dirName} (expected: ${expectedConnectorName})`);
        return;
      }

      if (!SyncServiceClass) {
        console.warn(`⚠️  No sync service class found for ${dirName} (expected: ${expectedSyncServiceName})`);
        return;
      }

      // Create a dummy data source to get metadata
      const dummyDataSource = {
        _id: "dummy",
        name: "dummy",
        type: dirName,
        config: {},
        settings: {},
      } as unknown as IDataSource;

      let metadata;
      try {
        const tempConnector = new ConnectorClass(dummyDataSource);
        metadata = tempConnector.getMetadata();
      } catch {
        // If constructor fails, try to get static metadata
        metadata = {
          name: dirName.charAt(0).toUpperCase() + dirName.slice(1),
          version: "1.0.0",
          description: `${dirName} connector`,
          supportedEntities: [],
        };
      }

      // Register the connector
      this.register({
        type: dirName,
        connector: ConnectorClass,
        syncService: SyncServiceClass,
        metadata,
      });

      console.log(`✅ Loaded connector: ${dirName} (${metadata.name})`);
    } catch (error) {
      console.error(`❌ Failed to import connector ${dirName}:`, error);
    }
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
   * Get a sync service instance for a data source
   */
  getSyncService(dataSource: IDataSource): any | null {
    const metadata = this.connectors.get(dataSource.type);
    if (!metadata) {
      return null;
    }

    const SyncServiceClass = metadata.syncService;
    return new SyncServiceClass(dataSource);
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

  /**
   * Force re-initialization (useful for development)
   */
  async reinitialize() {
    this.connectors.clear();
    this.initialized = false;
    await this.initializeConnectors();
  }
}

// Export singleton instance
export const connectorRegistry = new ConnectorRegistry();

// Export class for testing
export { ConnectorRegistry };
