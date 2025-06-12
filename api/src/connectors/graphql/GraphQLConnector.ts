import {
  BaseConnector,
  ConnectionTestResult,
  SyncOptions,
} from "../base/BaseConnector";
import { MongoClient } from "mongodb";
import axios, { AxiosInstance } from "axios";

// Simple object path getter function
function get(obj: any, path: string, defaultValue?: any): any {
  const keys = path.split(".");
  let result = obj;

  for (const key of keys) {
    if (result && typeof result === "object" && key in result) {
      result = result[key];
    } else {
      return defaultValue;
    }
  }

  return result;
}

export class GraphQLConnector extends BaseConnector {
  private graphqlClient: AxiosInstance | null = null;

  getMetadata() {
    return {
      name: "GraphQL",
      version: "1.0.0",
      description: "Generic GraphQL API connector",
      supportedEntities: this.getAvailableEntities(),
    };
  }

  validateConfig() {
    const base = super.validateConfig();
    const errors = [...base.errors];

    if (!this.dataSource.config.endpoint) {
      errors.push("GraphQL endpoint is required");
    }

    if (
      !this.dataSource.config.queries ||
      this.dataSource.config.queries.length === 0
    ) {
      errors.push("At least one query must be configured");
    }

    // Validate each query
    if (this.dataSource.config.queries) {
      this.dataSource.config.queries.forEach((query: any, index: number) => {
        if (!query.name) {
          errors.push(`Query ${index + 1} is missing a name`);
        }
        if (!query.query) {
          errors.push(`Query ${index + 1} is missing the GraphQL query`);
        }
      });
    }

    return { valid: errors.length === 0, errors };
  }

  private getGraphQLClient(): AxiosInstance {
    if (!this.graphqlClient) {
      if (!this.dataSource.config.endpoint) {
        throw new Error("GraphQL endpoint not configured");
      }

      const headers = {
        "Content-Type": "application/json",
        ...(this.dataSource.config.headers || {}),
      };

      this.graphqlClient = axios.create({
        baseURL: this.dataSource.config.endpoint,
        headers,
      });
    }
    return this.graphqlClient;
  }

  async testConnection(): Promise<ConnectionTestResult> {
    try {
      const validation = this.validateConfig();
      if (!validation.valid) {
        return {
          success: false,
          message: "Invalid configuration",
          details: validation.errors,
        };
      }

      const client = this.getGraphQLClient();

      // Test connection with introspection query
      const response = await client.post("", {
        query: `
          query {
            __schema {
              queryType {
                name
              }
            }
          }
        `,
      });

      if (response.data.errors) {
        return {
          success: false,
          message: "GraphQL endpoint returned errors",
          details: response.data.errors,
        };
      }

      return {
        success: true,
        message: "Successfully connected to GraphQL endpoint",
      };
    } catch (error) {
      return {
        success: false,
        message: "Failed to connect to GraphQL endpoint",
        details: axios.isAxiosError(error) ? error.message : String(error),
      };
    }
  }

  getAvailableEntities(): string[] {
    if (!this.dataSource.config.queries) {
      return [];
    }
    return this.dataSource.config.queries.map((q: any) => q.name);
  }

  async syncAll(options: SyncOptions): Promise<void> {
    if (!this.dataSource.config.queries) {
      throw new Error("No queries configured");
    }

    for (const queryConfig of this.dataSource.config.queries) {
      await this.syncEntity(queryConfig.name, options);
    }
  }

  async syncEntity(entity: string, options: SyncOptions): Promise<void> {
    const { targetDatabase, progress } = options;

    if (!targetDatabase) {
      throw new Error("Target database is required for sync");
    }

    const queryConfig = this.dataSource.config.queries?.find(
      (q: any) => q.name.toLowerCase() === entity.toLowerCase(),
    );

    if (!queryConfig) {
      throw new Error(`Query configuration not found for entity: ${entity}`);
    }

    await this.syncQuery(queryConfig, targetDatabase, progress);
  }

  private async syncQuery(queryConfig: any, targetDb: any, progress?: any) {
    const client = this.getGraphQLClient();
    const delay = this.getRateLimitDelay();

    const mongoClient = new MongoClient(targetDb.connection.connection_string);
    await mongoClient.connect();
    const db = mongoClient.db(targetDb.connection.database);
    const collection = db.collection(
      `graphql_${queryConfig.name.toLowerCase()}`,
    );

    try {
      let hasMore = true;
      let cursor: any = null;
      let totalSynced = 0;

      while (hasMore) {
        // Build variables with cursor if applicable
        const variables = {
          ...(queryConfig.variables || {}),
          ...(cursor && queryConfig.cursorPath ? { cursor } : {}),
        };

        // Execute GraphQL query
        const response = await client.post("", {
          query: queryConfig.query,
          variables,
        });

        if (response.data.errors) {
          throw new Error(
            `GraphQL query errors: ${JSON.stringify(response.data.errors)}`,
          );
        }

        // Extract data from response using configured path
        const data = queryConfig.dataPath
          ? get(response.data.data, queryConfig.dataPath)
          : response.data.data;

        if (!Array.isArray(data)) {
          throw new Error(
            "Query result is not an array. Check your dataPath configuration.",
          );
        }

        if (data.length > 0) {
          const documents = data.map((item: any) => ({
            ...item,
            _syncedAt: new Date(),
            _dataSourceId: this.dataSource._id.toString(),
          }));

          // Use a unique field if specified, otherwise use the whole document for matching
          const uniqueField = queryConfig.uniqueField || "id";

          await collection.bulkWrite(
            documents.map((doc: any) => ({
              replaceOne: {
                filter:
                  uniqueField && doc[uniqueField]
                    ? { [uniqueField]: doc[uniqueField] }
                    : doc,
                replacement: doc,
                upsert: true,
              },
            })),
          );

          totalSynced += documents.length;
          if (progress) {
            progress.reportBatch(documents.length);
          }
        }

        // Check if there are more pages
        if (queryConfig.hasNextPagePath) {
          hasMore = get(response.data.data, queryConfig.hasNextPagePath, false);
        } else if (queryConfig.cursorPath && data.length > 0) {
          // Extract cursor from last item
          cursor = get(data[data.length - 1], queryConfig.cursorPath);
          hasMore = cursor !== null && cursor !== undefined;
        } else {
          // No pagination configured, assume single page
          hasMore = false;
        }

        if (hasMore) {
          await this.sleep(delay);
        }
      }

      if (progress) {
        progress.reportComplete();
      }

      console.log(`✓ Synced ${totalSynced} items from ${queryConfig.name}`);
    } finally {
      await mongoClient.close();
    }
  }
}
