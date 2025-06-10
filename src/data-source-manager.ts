import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

export interface DataSourceConnection {
  // Common fields
  api_key?: string;

  // API sources
  api_base_url?: string;

  // GraphQL sources
  endpoint?: string;
  headers?: { [key: string]: string };
  queries?: Array<{
    name: string;
    query: string;
    variables?: { [key: string]: any };
    dataPath?: string;
    hasNextPagePath?: string;
    cursorPath?: string;
    totalCountPath?: string;
  }>;

  // Database sources
  connection_string?: string;
  database?: string;

  // Additional connection parameters
  [key: string]: any;
}

export interface DataSourceSettings {
  sync_batch_size?: number;
  rate_limit_delay_ms?: number;
  timezone?: string;
  max_pool_size?: number;
  min_pool_size?: number;
  [key: string]: any;
}

export interface DataSourceConfig {
  id: string;
  name: string;
  description?: string;
  active: boolean;
  type: string; // 'close', 'stripe', 'mongodb', etc.
  connection: DataSourceConnection;
  settings: DataSourceSettings;
}

export interface GlobalConfig {
  max_retries: number;
  default_timezone: string;
  logging: {
    level: string;
    include_api_responses: boolean;
  };
}

export interface MongoDBDatabase {
  name: string;
  description?: string;
  database: string;
  active: boolean;
  settings?: DataSourceSettings;
}

export interface MongoDBServer {
  name: string;
  description?: string;
  connection_string: string;
  active: boolean;
  databases: { [key: string]: MongoDBDatabase };
}

export interface ConfigFile {
  data_sources: { [key: string]: Omit<DataSourceConfig, 'id'> };
  mongodb_servers?: { [key: string]: MongoDBServer };
  global: GlobalConfig;
}

class DataSourceManager {
  private config: ConfigFile | null = null;
  private configPath: string;

  constructor(configPath?: string) {
    this.configPath =
      configPath || path.join(process.cwd(), 'config', 'config.yaml');
  }

  /**
   * Load and parse the configuration file
   */
  loadConfig(): ConfigFile {
    if (this.config) {
      return this.config as ConfigFile;
    }

    try {
      if (!fs.existsSync(this.configPath)) {
        throw new Error(`Configuration file not found: ${this.configPath}`);
      }

      const fileContents = fs.readFileSync(this.configPath, 'utf8');
      const rawConfig = yaml.load(fileContents) as ConfigFile;

      // Process environment variable substitution
      this.config = this.processEnvironmentVariables(rawConfig);

      return this.config as ConfigFile;
    } catch (error) {
      throw new Error(`Failed to load configuration: ${error}`);
    }
  }

  /**
   * Get all active data sources
   */
  getActiveDataSources(): DataSourceConfig[] {
    const config = this.loadConfig();

    return Object.entries(config.data_sources)
      .filter(([_, source]) => source.active)
      .map(([id, source]) => ({
        id,
        ...source,
        // Merge global settings with source-specific settings
        settings: {
          ...this.getDefaultSettings(),
          ...source.settings,
        },
      }));
  }

  /**
   * Get a specific data source by ID
   */
  getDataSource(sourceId: string): DataSourceConfig | null {
    const config = this.loadConfig();

    if (!config.data_sources[sourceId]) {
      return null;
    }

    const source = config.data_sources[sourceId];

    return {
      id: sourceId,
      ...source,
      settings: {
        ...this.getDefaultSettings(),
        ...source.settings,
      },
    };
  }

  /**
   * Get data sources by type
   */
  getDataSourcesByType(type: string): DataSourceConfig[] {
    return this.getActiveDataSources().filter((source) => source.type === type);
  }

  /**
   * Get MongoDB database by server.database format
   */
  getMongoDBDatabase(identifier: string): DataSourceConfig | null {
    const config = this.loadConfig();

    if (!config.mongodb_servers) {
      return null;
    }

    const [serverId, databaseId] = identifier.split('.');

    if (!serverId || !databaseId) {
      return null;
    }

    const server = config.mongodb_servers[serverId];
    if (!server || !server.active) {
      return null;
    }

    const database = server.databases[databaseId];
    if (!database || !database.active) {
      return null;
    }

    // Convert to DataSourceConfig format for compatibility
    return {
      id: `${serverId}.${databaseId}`,
      name: database.name,
      description: database.description,
      active: true,
      type: 'mongodb',
      connection: {
        connection_string: server.connection_string,
        database: database.database,
      },
      settings: {
        ...this.getDefaultSettings(),
        ...database.settings,
      },
    };
  }

  /**
   * List all MongoDB servers
   */
  listMongoDBServers(): string[] {
    const config = this.loadConfig();

    if (!config.mongodb_servers) {
      return [];
    }

    return Object.entries(config.mongodb_servers)
      .filter(([_, server]) => server.active)
      .map(([id]) => id);
  }

  /**
   * List all MongoDB databases in server.database format
   */
  listMongoDBDatabases(): string[] {
    const config = this.loadConfig();
    const databases: string[] = [];

    if (!config.mongodb_servers) {
      return databases;
    }

    Object.entries(config.mongodb_servers).forEach(([serverId, server]) => {
      if (server.active) {
        Object.entries(server.databases).forEach(([dbId, db]) => {
          if (db.active) {
            databases.push(`${serverId}.${dbId}`);
          }
        });
      }
    });

    return databases;
  }

  /**
   * Get all MongoDB data sources
   */
  getMongoDBSources(): DataSourceConfig[] {
    const sources: DataSourceConfig[] = [];

    // Get legacy mongodb sources from data_sources
    sources.push(...this.getDataSourcesByType('mongodb'));

    // Get new format mongodb sources
    const databases = this.listMongoDBDatabases();
    databases.forEach((dbId) => {
      const db = this.getMongoDBDatabase(dbId);
      if (db) {
        sources.push(db);
      }
    });

    return sources;
  }

  /**
   * Get the primary analytics database (for backward compatibility)
   */
  getPrimaryDatabase(): DataSourceConfig | null {
    // Try new format first
    const analyticsDb = this.getMongoDBDatabase('local_dev.analytics_db');
    if (analyticsDb) {
      return analyticsDb;
    }

    // Fall back to legacy format
    const mongoSources = this.getMongoDBSources();
    return (
      mongoSources.find((source) => source.id === 'analytics_db') ||
      mongoSources[0] ||
      null
    );
  }

  /**
   * Get global configuration
   */
  getGlobalConfig(): GlobalConfig {
    const config = this.loadConfig();
    return config.global;
  }

  /**
   * List all data source IDs
   */
  listDataSourceIds(): string[] {
    const config = this.loadConfig();
    return Object.keys(config.data_sources);
  }

  /**
   * List active data source IDs
   */
  listActiveDataSourceIds(): string[] {
    return this.getActiveDataSources().map((s) => s.id);
  }

  /**
   * Validate configuration
   */
  validateConfig(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    try {
      const config = this.loadConfig();

      // Validate global config
      if (!config.global) {
        errors.push('Global configuration is missing');
      }

      // Validate data sources
      if (
        !config.data_sources ||
        Object.keys(config.data_sources).length === 0
      ) {
        errors.push('No data sources configured');
      }

      // Validate each data source
      Object.entries(config.data_sources).forEach(([id, source]) => {
        if (!source.name) {
          errors.push(`Data source '${id}' is missing a name`);
        }

        if (!source.type) {
          errors.push(`Data source '${id}' is missing a type`);
        }

        if (!source.connection) {
          errors.push(
            `Data source '${id}' is missing connection configuration`,
          );
        }

        // Type-specific validation
        switch (source.type) {
          case 'close':
          case 'stripe':
            if (!source.connection.api_key) {
              errors.push(
                `Data source '${id}' (${source.type}) is missing api_key`,
              );
            }
            break;
          case 'graphql':
            if (!source.connection.endpoint) {
              errors.push(`Data source '${id}' (graphql) is missing endpoint`);
            }
            if (
              !source.connection.queries ||
              source.connection.queries.length === 0
            ) {
              errors.push(
                `Data source '${id}' (graphql) is missing queries configuration`,
              );
            } else {
              // Validate each query configuration
              source.connection.queries.forEach((query: any, index: number) => {
                if (!query.name) {
                  errors.push(
                    `Data source '${id}' (graphql) query ${index + 1} is missing name`,
                  );
                }
                if (!query.query) {
                  errors.push(
                    `Data source '${id}' (graphql) query ${index + 1} is missing query`,
                  );
                }
              });
            }
            break;
          case 'mongodb':
            if (!source.connection.connection_string) {
              errors.push(
                `Data source '${id}' (mongodb) is missing connection_string`,
              );
            }
            if (!source.connection.database) {
              errors.push(
                `Data source '${id}' (mongodb) is missing database name`,
              );
            }
            break;
        }
      });

      return { valid: errors.length === 0, errors };
    } catch (error) {
      errors.push(`Configuration validation failed: ${error}`);
      return { valid: false, errors };
    }
  }

  /**
   * Process environment variable substitution in configuration
   */
  private processEnvironmentVariables(obj: any): any {
    if (typeof obj === 'string') {
      // Check for environment variable pattern ${VAR_NAME}
      const envVarPattern = /\$\{([^}]+)\}/g;
      return obj.replace(envVarPattern, (match, varName) => {
        const value = process.env[varName];
        if (!value) {
          console.warn(
            `Environment variable ${varName} is not set, using placeholder`,
          );
          return match;
        }
        return value;
      });
    } else if (Array.isArray(obj)) {
      return obj.map((item) => this.processEnvironmentVariables(item));
    } else if (typeof obj === 'object' && obj !== null) {
      const processed: any = {};
      for (const key in obj) {
        processed[key] = this.processEnvironmentVariables(obj[key]);
      }
      return processed;
    }
    return obj;
  }

  /**
   * Get default settings merged from global config
   */
  private getDefaultSettings(): DataSourceSettings {
    const global = this.getGlobalConfig();

    return {
      sync_batch_size: 100,
      rate_limit_delay_ms: 200,
      timezone: global.default_timezone || 'UTC',
      max_retries: global.max_retries,
    };
  }
}

// Export singleton instance
export const dataSourceManager = new DataSourceManager();

// Export class for custom instances
export { DataSourceManager };
