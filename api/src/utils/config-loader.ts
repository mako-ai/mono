import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";

export interface DataSourceConnection {
  connection_string?: string;
  database?: string;
  [key: string]: any;
}

export interface DataSourceSettings {
  max_pool_size?: number;
  min_pool_size?: number;
  [key: string]: any;
}

export interface DataSourceConfig {
  id: string;
  name: string;
  description?: string;
  active: boolean;
  type: string;
  connection: DataSourceConnection;
  settings: DataSourceSettings;
}

export interface MongoDatabase {
  id: string;
  name: string;
  description?: string;
  database: string;
  active: boolean;
  settings: DataSourceSettings;
  serverId: string;
  serverName: string;
  connectionString: string;
}

export interface MongoServer {
  id: string;
  name: string;
  description?: string;
  connection_string: string;
  active: boolean;
  databases: {
    [key: string]: Omit<
      MongoDatabase,
      "id" | "serverId" | "serverName" | "connectionString"
    >;
  };
}

interface ConfigFile {
  data_sources: { [key: string]: Omit<DataSourceConfig, "id"> };
  mongodb_servers?: { [key: string]: Omit<MongoServer, "id"> };
  global: any;
}

class ConfigLoader {
  private config: ConfigFile | null = null;
  private configPath: string;

  constructor() {
    // Look for config.yaml in the project root (../../../config/config.yaml from api/src/utils)
    this.configPath = path.join(__dirname, "../../../config/config.yaml");
  }

  /**
   * Load and parse the configuration file
   */
  loadConfig(): ConfigFile {
    if (this.config) {
      return this.config;
    }

    try {
      if (!fs.existsSync(this.configPath)) {
        throw new Error(`Configuration file not found: ${this.configPath}`);
      }

      const fileContents = fs.readFileSync(this.configPath, "utf8");
      const rawConfig = yaml.load(fileContents) as ConfigFile;

      // Process environment variable substitution
      this.config = this.processEnvironmentVariables(rawConfig) as ConfigFile;

      return this.config;
    } catch (error) {
      throw new Error(`Failed to load configuration: ${error}`);
    }
  }

  /**
   * Get all MongoDB servers
   */
  getMongoServers(): MongoServer[] {
    const config = this.loadConfig();

    if (!config.mongodb_servers) {
      // For backward compatibility, convert old data_sources format
      return this.getMongoServersFromLegacyFormat();
    }

    return Object.entries(config.mongodb_servers)
      .filter(([_, server]) => server.active)
      .map(([id, server]) => ({
        id,
        ...server,
      }));
  }

  /**
   * Get all MongoDB databases across all servers
   */
  getMongoDBSources(): MongoDatabase[] {
    const servers = this.getMongoServers();
    const databases: MongoDatabase[] = [];

    servers.forEach(server => {
      if (server.databases) {
        Object.entries(server.databases).forEach(([dbId, db]) => {
          if (db.active) {
            databases.push({
              id: `${server.id}.${dbId}`,
              ...db,
              serverId: server.id,
              serverName: server.name,
              connectionString: server.connection_string,
            });
          }
        });
      }
    });

    return databases;
  }

  /**
   * Get a specific MongoDB database by ID (format: serverId.databaseId)
   */
  getMongoDBSource(sourceId: string): MongoDatabase | null {
    const databases = this.getMongoDBSources();
    return databases.find(db => db.id === sourceId) || null;
  }

  /**
   * Get databases for a specific server
   */
  getDatabasesForServer(serverId: string): MongoDatabase[] {
    const databases = this.getMongoDBSources();
    return databases.filter(db => db.serverId === serverId);
  }

  /**
   * For backward compatibility - convert old format to new server format
   */
  private getMongoServersFromLegacyFormat(): MongoServer[] {
    const config = this.loadConfig();
    const serverMap = new Map<string, MongoServer>();

    // Group legacy MongoDB data sources by connection string
    Object.entries(config.data_sources)
      .filter(([_, source]) => source.type === "mongodb" && source.active)
      .forEach(([id, source]) => {
        if (source.connection?.connection_string) {
          // Extract base connection string (without database)
          const baseConnString =
            source.connection.connection_string.split("/")[0];

          if (!serverMap.has(baseConnString)) {
            serverMap.set(baseConnString, {
              id: `server_${serverMap.size + 1}`,
              name: "MongoDB Server",
              description: "Auto-detected from legacy config",
              connection_string: baseConnString,
              active: true,
              databases: {},
            });
          }

          const server = serverMap.get(baseConnString)!;
          server.databases[id] = {
            name: source.name,
            description: source.description,
            database: source.connection.database || id,
            active: source.active,
            settings: source.settings || {},
          };
        }
      });

    return Array.from(serverMap.values());
  }

  /**
   * Process environment variable substitution in configuration
   */
  private processEnvironmentVariables(obj: any): any {
    if (typeof obj === "string") {
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
      return obj.map(item => this.processEnvironmentVariables(item));
    } else if (typeof obj === "object" && obj !== null) {
      const processed: any = {};
      for (const key in obj) {
        processed[key] = this.processEnvironmentVariables(obj[key]);
      }
      return processed;
    }
    return obj;
  }
}

// Export singleton instance
export const configLoader = new ConfigLoader();
