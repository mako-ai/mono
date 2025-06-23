import { MongoClient, Db } from "mongodb";
import axios, { AxiosError } from "axios";
import { IDataSource } from "../../database/workspace-schema";

export interface ProgressReporter {
  updateTotal(total: number): void;
  reportBatch(batchSize: number): void;
  reportComplete(): void;
}

interface GraphQLQuery {
  name: string;
  query: string;
  variables?: { [key: string]: any };
  dataPath?: string; // JSON path to extract data from response (e.g., "data.users", "data.products.edges")
  hasNextPagePath?: string; // Path to check if there are more pages (e.g., "data.users.pageInfo.hasNextPage")
  cursorPath?: string; // Path to get cursor for pagination (e.g., "data.users.pageInfo.endCursor")
  totalCountPath?: string; // Path to get total count (e.g., "data.users.totalCount")
  data_path?: string; // Snake case support
  has_next_page_path?: string;
  cursor_path?: string;
  total_count_path?: string;
}

interface GraphQLHeaders {
  [key: string]: string;
}

export class GraphQLSyncService {
  private mongoConnections: Map<string, { client: MongoClient; db: Db }> = new Map();
  private dataSource: IDataSource;
  private graphqlEndpoint: string;
  private headers: GraphQLHeaders;
  private settings: {
    batchSize: number;
    rateLimitDelay: number;
    maxRetries: number;
    timeout: number;
  };

  constructor(dataSource: IDataSource) {
    this.dataSource = dataSource;

    // Get GraphQL configuration
    if (!dataSource.config.endpoint) {
      throw new Error(
        `GraphQL endpoint is required for data source ${dataSource._id}`,
      );
    }

    this.graphqlEndpoint = dataSource.config.endpoint;

    // Setup headers
    this.headers = {
      "Content-Type": "application/json",
    };

    // Parse headers if they exist (they come as a JSON string after decryption)
    if (dataSource.config.headers) {
      try {
        let parsedHeaders: any;

        // Check if headers is already an object (shouldn't happen with new system)
        if (typeof dataSource.config.headers === "object") {
          parsedHeaders = dataSource.config.headers;
        } else if (typeof dataSource.config.headers === "string") {
          // Parse the JSON string
          parsedHeaders = JSON.parse(dataSource.config.headers);
        }

        // Merge parsed headers with default headers
        if (parsedHeaders && typeof parsedHeaders === "object") {
          Object.assign(this.headers, parsedHeaders);
        }
      } catch (error) {
        console.error("Failed to parse headers JSON:", error);
        console.error("Headers value:", dataSource.config.headers);
        throw new Error(
          `Invalid headers format: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    }

    // Add authorization if provided (legacy support)
    if (dataSource.config.api_key) {
      this.headers["Authorization"] = `Bearer ${dataSource.config.api_key}`;
    }

    // Get settings with defaults
    this.settings = {
      batchSize: dataSource.settings?.sync_batch_size || 100,
      rateLimitDelay: dataSource.settings?.rate_limit_delay_ms || 200,
      maxRetries: dataSource.settings?.max_retries || 5,
      timeout: dataSource.settings?.timeout_ms || 30000,
    };

    // Ensure batch size is a valid number
    if (!this.settings.batchSize || this.settings.batchSize <= 0) {
      console.warn(
        `⚠️ Invalid batch size (${this.settings.batchSize}), using default 100`,
      );
      this.settings.batchSize = 100;
    }
  }

  private async getMongoConnection(
    targetDb: any,
  ): Promise<{ client: MongoClient; db: Db }> {
    // If targetDb is an object with connection info, use it directly
    if (typeof targetDb === "object" && targetDb.connection) {
      const client = new MongoClient(targetDb.connection.connection_string);
      await client.connect();
      const db = client.db(targetDb.connection.database);

      console.log(
        `Connected to MongoDB: ${targetDb.name} for GraphQL source: ${this.dataSource.name}`,
      );

      return { client, db };
    }

    // Legacy string ID not supported anymore
    throw new Error(
      `GraphQL sync requires a database object, not a string ID. Received: ${targetDb}`,
    );
  }

  private async disconnect(): Promise<void> {
    for (const [dbId, connection] of this.mongoConnections.entries()) {
      await connection.client.close();
      console.log(`Disconnected from MongoDB: ${dbId}`);
    }
    this.mongoConnections.clear();
  }

  /**
   * Execute a GraphQL query with retry logic and rate limiting
   */
  private async executeGraphQLQuery(
    query: string,
    variables?: { [key: string]: any },
  ): Promise<any> {
    let attempts = 0;

    while (attempts <= this.settings.maxRetries) {
      try {
        const response = await axios.post(
          this.graphqlEndpoint,
          {
            query,
            variables: variables || {},
          },
          {
            headers: this.headers,
            timeout: this.settings.timeout,
          },
        );

        // Check for GraphQL errors
        if (response.data.errors && response.data.errors.length > 0) {
          const errorMessage = response.data.errors
            .map((err: any) => err.message)
            .join(", ");
          console.error("❌ GraphQL errors:", response.data.errors);
          throw new Error(`GraphQL errors: ${errorMessage}`);
        }

        // Check if data exists
        if (!response.data.data) {
          console.error("❌ No data in response:", response.data);
          throw new Error("GraphQL response missing data field");
        }

        return response.data;
      } catch (error) {
        const axiosError: AxiosError | any = error;

        // Log detailed error information for first attempt
        if (attempts === 0) {
          console.error("❌ GraphQL query failed:", {
            message: error instanceof Error ? error.message : "Unknown error",
            status: axiosError.response?.status,
            statusText: axiosError.response?.statusText,
            endpoint: this.graphqlEndpoint,
            variables: variables,
          });

          if (axiosError.response?.data) {
            console.error("📄 Response data:", axiosError.response.data);
          }
        }

        // Handle HTTP 429 specifically (rate limiting)
        if (axiosError.response?.status === 429) {
          const retryAfterHeader = axiosError.response.headers?.["retry-after"];
          const retryAfterSeconds = retryAfterHeader
            ? parseInt(retryAfterHeader, 10)
            : NaN;
          const delayMs = !isNaN(retryAfterSeconds)
            ? retryAfterSeconds * 1000
            : 1000 * Math.pow(2, attempts);

          console.warn(
            `⏳ Received 429 Too Many Requests from GraphQL API. Waiting ${delayMs}ms before retrying (attempt ${
              attempts + 1
            }/${this.settings.maxRetries}).`,
          );
          await this.delay(delayMs);
          attempts++;
          continue;
        }

        // Handle authentication errors
        if (
          axiosError.response?.status === 401 ||
          axiosError.response?.status === 403
        ) {
          console.error("🔒 Authentication/Authorization error:", {
            status: axiosError.response.status,
            message:
              axiosError.response.data?.message ||
              axiosError.response.statusText,
          });
        }

        // Handle other retryable errors
        const isRetryable = this.isRetryableAxiosError(error);
        attempts++;

        if (!isRetryable || attempts > this.settings.maxRetries) {
          console.error(
            `❌ Failed to execute GraphQL query after ${attempts} attempt(s).`,
          );
          throw error;
        }

        const backoff = 500 * Math.pow(2, attempts); // exponential backoff starting at 0.5s
        console.warn(
          `⚠️  Error executing GraphQL query (attempt ${attempts}/${this.settings.maxRetries}). Retrying in ${backoff}ms …`,
        );
        await this.delay(backoff);
      }
    }
  }

  /**
   * Fetch all data from a GraphQL query with pagination support
   */
  private async fetchAllGraphQLData(
    queryConfig: GraphQLQuery,
    progress?: ProgressReporter,
    onBatch?: (records: any[]) => Promise<void>,
  ): Promise<any[]> {
    const results: any[] = [];
    let hasMore = true;
    let cursor: string | null = null;
    let offset = 0;

    // Determine pagination type based on query
    const usesCursorPagination =
      queryConfig.query.includes("$after") ||
      queryConfig.query.includes("$cursor");
    const usesOffsetPagination =
      queryConfig.query.includes("$offset") ||
      queryConfig.query.includes("offset:");

    // Try to get total count first if path is provided
    if (progress && queryConfig.totalCountPath) {
      try {
        // Build variables that satisfy the query requirements
        let countVariables: any = {
          ...queryConfig.variables,
        };

        if (usesCursorPagination) {
          countVariables = {
            ...countVariables,
            first: 0, // Get count only
          };
        } else if (usesOffsetPagination) {
          // For Hasura, provide required variables but with limit 0 to get just the aggregate
          countVariables = {
            ...countVariables,
            limit: 0,
            offset: 0,
          };
        } else {
          // Auto-detect: provide both
          countVariables = {
            ...countVariables,
            first: 0,
            limit: 0,
            offset: 0,
          };
        }

        const countResponse = await this.executeGraphQLQuery(
          queryConfig.query,
          countVariables,
        );
        const totalCount = this.getValueByPath(
          countResponse,
          queryConfig.totalCountPath,
        );
        if (totalCount && typeof totalCount === "number") {
          progress.updateTotal(totalCount);
        }
      } catch {
        console.log(
          "Could not fetch total count, continuing without total progress",
        );
      }
    }

    while (hasMore) {
      // Build query variables based on pagination type
      let variables: any = {
        ...queryConfig.variables,
      };

      if (usesCursorPagination) {
        // Cursor-based pagination (Relay style)
        variables = {
          ...variables,
          ...(cursor && { after: cursor }),
          first: Number(this.settings.batchSize),
        };
      } else if (usesOffsetPagination) {
        // Offset-based pagination (Hasura style)
        variables = {
          ...variables,
          limit: Number(this.settings.batchSize),
          offset: Number(offset),
        };
      } else {
        // Auto-detect or simple pagination
        variables = {
          ...variables,
          first: Number(this.settings.batchSize),
          limit: Number(this.settings.batchSize),
          offset: Number(offset),
        };
      }

      const response = await this.executeGraphQLQuery(
        queryConfig.query,
        variables,
      );

      // Extract data using the configured path
      const dataPath = queryConfig.dataPath || "data";
      const data = this.getValueByPath(response, dataPath);

      if (!Array.isArray(data)) {
        console.warn(`Data at path '${dataPath}' is not an array:`, data);
        break;
      }

      // Process data
      if (onBatch) {
        await onBatch(data);
      } else {
        results.push(...data);
      }

      // Report batch completion
      if (progress && data.length > 0) {
        progress.reportBatch(data.length);
      }

      // Check for more pages based on pagination type
      if (queryConfig.hasNextPagePath) {
        // Use configured pagination check
        hasMore = this.getValueByPath(response, queryConfig.hasNextPagePath);
      } else {
        // Auto-detect: if we got fewer records than batch size, we're done
        hasMore = data.length === this.settings.batchSize;
      }

      // Update pagination parameters for next iteration
      if (hasMore) {
        if (usesCursorPagination && queryConfig.cursorPath) {
          // Get cursor for next page
          cursor = this.getValueByPath(response, queryConfig.cursorPath);
        } else {
          // Update offset for next page
          offset += this.settings.batchSize;
        }
      }

      // Apply rate limiting between requests
      if (hasMore) {
        await this.delay(this.settings.rateLimitDelay);
      }
    }

    // Report completion
    if (progress) {
      progress.reportComplete();
    }

    return results;
  }

  /**
   * Sync data using a custom GraphQL query
   */
  async syncEntity(
    queryConfig: GraphQLQuery,
    targetDb?: any,
    progress?: ProgressReporter,
  ): Promise<void> {
    // Ensure queryConfig is normalised (handles snake_case keys coming from
    // CLI path where no prior normalisation happened).
    queryConfig = this.normalizeQueryConfig(queryConfig);

    console.log(
      `Starting ${queryConfig.name} sync for: ${this.dataSource.name}`,
    );
    const { db } = await this.getMongoConnection(targetDb);

    const mainCollectionName = `${this.dataSource.name}_${queryConfig.name}`;
    const stagingCollectionName = `${mainCollectionName}_staging`;

    // Prepare staging collection (drop if exists to ensure fresh start)
    if (await db.listCollections({ name: stagingCollectionName }).hasNext()) {
      await db.collection(stagingCollectionName).drop();
    }
    const stagingCollection = db.collection(stagingCollectionName);

    try {
      // Fetch GraphQL data in batches and write each batch directly to staging
      await this.fetchAllGraphQLData(queryConfig, progress, async batch => {
        if (batch.length === 0) return;

        const processedRecords = batch.map(record => ({
          ...record,
          _syncedAt: new Date(),
          _dataSourceId: this.dataSource._id.toString(),
          _dataSourceName: this.dataSource.name,
          _type: queryConfig.name,
        }));

        const bulkOps = processedRecords.map(record => ({
          replaceOne: {
            filter: {
              id: record.id,
              _dataSourceId: this.dataSource._id.toString(),
            },
            replacement: record,
            upsert: true,
          },
        }));

        await stagingCollection.bulkWrite(bulkOps, { ordered: false });
      });

      // Completed successfully – atomically swap staging into main
      if (await db.listCollections({ name: mainCollectionName }).hasNext()) {
        await db.collection(mainCollectionName).drop();
      }
      await stagingCollection.rename(mainCollectionName, { dropTarget: true });

      console.log(
        `✅ ${queryConfig.name} synced and collection swapped successfully (${mainCollectionName})`,
      );
    } catch (error) {
      console.error(`${queryConfig.name} sync failed:`, error);
      throw error;
    }
  }

  /**
   * Sync all configured entities
   */
  async syncAll(targetDb?: any): Promise<void> {
    console.log(
      `\n🔄 Starting full sync for GraphQL source: ${this.dataSource.name}`,
    );
    console.log(`Target database: ${targetDb?.name || "default"}`);
    const startTime = Date.now();

    try {
      // Original query definitions coming from the data-source record can use
      // snake_case keys (e.g. `data_path`) because they are stored directly in
      // MongoDB.  The sync code downstream, however, expects camelCase keys
      // (e.g. `dataPath`).  Here we normalise each query object so both
      // variants are accepted transparently.

      const rawQueries: any[] = this.dataSource.config.queries || [];

      const queries = rawQueries.map(q => {
        // If the camelCase variant is already present keep it; otherwise copy
        // from the snake_case counterpart.
        const normalised = {
          ...q,
          dataPath: q.dataPath ?? q.data_path,
          hasNextPagePath: q.hasNextPagePath ?? q.has_next_page_path,
          cursorPath: q.cursorPath ?? q.cursor_path,
          totalCountPath: q.totalCountPath ?? q.total_count_path,
        };

        return normalised;
      });

      if (queries.length === 0) {
        console.warn("No queries configured for this GraphQL data source");
        return;
      }

      // Sync all configured queries
      for (const queryConfig of queries) {
        const progress = new SimpleProgressReporter(queryConfig.name);
        await this.syncEntity(queryConfig, targetDb, progress);
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(
        `✅ Full sync completed for ${this.dataSource.name} in ${duration}s`,
      );
    } catch (error) {
      console.error(`❌ Sync failed for ${this.dataSource.name}:`, error);
      throw error;
    } finally {
      await this.disconnect();
    }
  }

  /**
   * Test the GraphQL connection
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      // Use introspection query to test connection
      const introspectionQuery = `
        query IntrospectionQuery {
          __schema {
            queryType {
              name
            }
          }
        }
      `;

      const response = await this.executeGraphQLQuery(introspectionQuery);

      if (response && response.data && response.data.__schema) {
        return {
          success: true,
          message: "GraphQL connection successful",
        };
      } else {
        return {
          success: false,
          message: "GraphQL connection failed: Invalid response",
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `GraphQL connection failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      };
    }
  }

  /**
   * Get value from object using dot notation path
   */
  private getValueByPath(obj: any, path: string): any {
    return path.split(".").reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : null;
    }, obj);
  }

  /**
   * Check if an axios error is retryable
   */
  private isRetryableAxiosError(error: any): boolean {
    if (!error.response) {
      // Network errors, timeouts, etc. are retryable
      return true;
    }

    const status = error.response.status;
    // Retry on server errors (5xx) and rate limiting (429)
    // Don't retry on client errors (4xx) except 429
    return status >= 500 || status === 429;
  }

  /**
   * Delay utility for rate limiting and retries
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Accept both snake_case and camelCase variants of GraphQL query config
   * keys that refer to JSON-paths so external callers (or DB records) can use
   * either style.  Returns a new object – does not mutate the original.
   */
  private normalizeQueryConfig(q: any): GraphQLQuery {
    return {
      ...q,
      dataPath: q.dataPath ?? q.data_path,
      hasNextPagePath: q.hasNextPagePath ?? q.has_next_page_path,
      cursorPath: q.cursorPath ?? q.cursor_path,
      totalCountPath: q.totalCountPath ?? q.total_count_path,
    } as GraphQLQuery;
  }
}

// Simple progress reporter implementation
class SimpleProgressReporter implements ProgressReporter {
  private startTime: Date;
  private totalRecords: number;
  private currentRecords: number = 0;
  private entityName: string;

  constructor(entityName: string, totalRecords?: number) {
    this.entityName = entityName;
    this.totalRecords = totalRecords || 0;
    this.startTime = new Date();
  }

  updateTotal(total: number) {
    this.totalRecords = total;
  }

  reportBatch(batchSize: number) {
    this.currentRecords += batchSize;
    this.displayProgress();
  }

  reportComplete() {
    this.currentRecords = this.totalRecords;
    this.displayProgress();
    console.log();
  }

  private displayProgress() {
    const elapsed = Date.now() - this.startTime.getTime();
    const elapsedStr = this.formatTime(elapsed);

    if (this.totalRecords > 0) {
      const percentage = Math.floor(
        (this.currentRecords / this.totalRecords) * 100,
      );
      const progressBar = this.createProgressBar(percentage);

      process.stdout.write(
        `\r🟢 Syncing ${this.entityName}: ${progressBar} ${percentage}% (${this.currentRecords.toLocaleString()}/${this.totalRecords.toLocaleString()}) | ⏱️  ${elapsedStr}`,
      );
    } else {
      process.stdout.write(
        `\r🟢 Syncing ${this.entityName}: ${this.currentRecords.toLocaleString()} records | ⏱️  ${elapsedStr}`,
      );
    }
  }

  private createProgressBar(percentage: number): string {
    const width = 20;
    const filled = Math.floor((width * percentage) / 100);
    const empty = width - filled;
    return "█".repeat(filled) + "░".repeat(empty);
  }

  private formatTime(milliseconds: number): string {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h${(minutes % 60).toString().padStart(2, "0")}m`;
    } else if (minutes > 0) {
      return `${minutes}m${(seconds % 60).toString().padStart(2, "0")}s`;
    } else {
      return `${seconds}s`;
    }
  }
}