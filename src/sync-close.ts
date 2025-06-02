import axios, { AxiosError } from "axios";
import { MongoClient, Db, Collection } from "mongodb";
import * as dotenv from "dotenv";
import { dataSourceManager } from "./data-source-manager";
import type { DataSourceConfig } from "./data-source-manager";

dotenv.config();

interface CloseApiResponse {
  data: any[];
  has_more: boolean;
  total_results?: number;
}

interface SyncStats {
  totalRecords: number;
  batchesProcessed: number;
  errors: number;
  startTime: Date;
  endTime?: Date;
}

class CloseSyncService {
  private mongoConnections: Map<string, { client: MongoClient; db: Db }> =
    new Map();
  private dataSource: DataSourceConfig;
  private closeApiKey: string;
  private closeApiUrl: string;
  private settings: {
    batchSize: number;
    rateLimitDelay: number;
    maxRetries: number;
  };

  constructor(dataSource: DataSourceConfig) {
    this.dataSource = dataSource;

    // Get Close configuration
    if (!dataSource.connection.api_key) {
      throw new Error(
        `Close API key is required for data source ${dataSource.id}`
      );
    }

    this.closeApiKey = dataSource.connection.api_key;
    this.closeApiUrl =
      dataSource.connection.api_base_url || "https://api.close.com/api/v1";

    // Get settings with defaults
    const globalConfig = dataSourceManager.getGlobalConfig();
    this.settings = {
      batchSize: dataSource.settings.sync_batch_size || 100,
      rateLimitDelay: dataSource.settings.rate_limit_delay_ms || 200,
      maxRetries:
        dataSource.settings.max_retries || globalConfig.max_retries || 5,
    };
  }

  private async getMongoConnection(
    targetDbId: string = "analytics_db"
  ): Promise<{ client: MongoClient; db: Db }> {
    // Check if connection already exists
    if (this.mongoConnections.has(targetDbId)) {
      return this.mongoConnections.get(targetDbId)!;
    }

    // Get target database configuration
    const targetDb = dataSourceManager.getDataSource(targetDbId);
    if (!targetDb || targetDb.type !== "mongodb") {
      throw new Error(`MongoDB data source '${targetDbId}' not found`);
    }

    // Create new connection
    const client = new MongoClient(targetDb.connection.connection_string!);
    await client.connect();
    const db = client.db(targetDb.connection.database);

    const connection = { client, db };
    this.mongoConnections.set(targetDbId, connection);

    console.log(
      `Connected to MongoDB: ${targetDb.name} for Close source: ${this.dataSource.name}`
    );
    return connection;
  }

  private async disconnect(): Promise<void> {
    for (const [dbId, connection] of this.mongoConnections.entries()) {
      await connection.client.close();
      console.log(`Disconnected from MongoDB: ${dbId}`);
    }
    this.mongoConnections.clear();
  }

  private async fetchCloseData(
    endpoint: string,
    params: any = {}
  ): Promise<any[]> {
    const results: any[] = [];
    let hasMore = true;
    let skip = 0;

    while (hasMore) {
      try {
        const response = await axios.get(`${this.closeApiUrl}/${endpoint}`, {
          headers: {
            Authorization: `Basic ${Buffer.from(
              this.closeApiKey + ":"
            ).toString("base64")}`,
            Accept: "application/json",
          },
          params: {
            ...params,
            _skip: skip,
            _limit: this.settings.batchSize,
          },
        });

        const data = response.data.data || [];
        results.push(...data);

        hasMore = response.data.has_more || false;
        skip += this.settings.batchSize;

        if (hasMore) {
          // Apply rate limiting
          await this.delay(this.settings.rateLimitDelay);
        }
      } catch (error) {
        console.error(`Error fetching from ${endpoint}:`, error);
        throw error;
      }
    }

    return results;
  }

  async syncLeads(targetDbId?: string): Promise<void> {
    console.log(`Starting leads sync for: ${this.dataSource.name}`);
    const { db } = await this.getMongoConnection(targetDbId);

    try {
      const leads = await this.fetchCloseData("lead");
      console.log(`Fetched ${leads.length} leads from Close.com`);

      const collection = db.collection("leads");

      // Process leads with data source reference
      const processedLeads = leads.map((lead) => ({
        ...lead,
        _dataSourceId: this.dataSource.id,
        _dataSourceName: this.dataSource.name,
        _syncedAt: new Date(),
      }));

      if (processedLeads.length > 0) {
        // Use bulk operations for efficiency
        const bulkOps = processedLeads.map((lead) => ({
          replaceOne: {
            filter: { id: lead.id, _dataSourceId: this.dataSource.id },
            replacement: lead,
            upsert: true,
          },
        }));

        const result = await collection.bulkWrite(bulkOps);
        console.log(
          `Upserted ${result.upsertedCount + result.modifiedCount} leads`
        );
      }
    } catch (error) {
      console.error("Lead sync failed:", error);
      throw error;
    }
  }

  async syncOpportunities(targetDbId?: string): Promise<void> {
    console.log(`Starting opportunities sync for: ${this.dataSource.name}`);
    const { db } = await this.getMongoConnection(targetDbId);

    try {
      const opportunities = await this.fetchCloseData("opportunity");
      console.log(
        `Fetched ${opportunities.length} opportunities from Close.com`
      );

      const collection = db.collection("opportunities");

      // Process opportunities with data source reference
      const processedOpportunities = opportunities.map((opp) => ({
        ...opp,
        _dataSourceId: this.dataSource.id,
        _dataSourceName: this.dataSource.name,
        _syncedAt: new Date(),
      }));

      if (processedOpportunities.length > 0) {
        const bulkOps = processedOpportunities.map((opp) => ({
          replaceOne: {
            filter: { id: opp.id, _dataSourceId: this.dataSource.id },
            replacement: opp,
            upsert: true,
          },
        }));

        const result = await collection.bulkWrite(bulkOps);
        console.log(
          `Upserted ${
            result.upsertedCount + result.modifiedCount
          } opportunities`
        );
      }
    } catch (error) {
      console.error("Opportunity sync failed:", error);
      throw error;
    }
  }

  async syncContacts(targetDbId?: string): Promise<void> {
    console.log(`Starting contacts sync for: ${this.dataSource.name}`);
    const { db } = await this.getMongoConnection(targetDbId);

    try {
      const contacts = await this.fetchCloseData("contact");
      console.log(`Fetched ${contacts.length} contacts from Close.com`);

      const collection = db.collection("contacts");

      // Process contacts with data source reference
      const processedContacts = contacts.map((contact) => ({
        ...contact,
        _dataSourceId: this.dataSource.id,
        _dataSourceName: this.dataSource.name,
        _syncedAt: new Date(),
      }));

      if (processedContacts.length > 0) {
        const bulkOps = processedContacts.map((contact) => ({
          replaceOne: {
            filter: { id: contact.id, _dataSourceId: this.dataSource.id },
            replacement: contact,
            upsert: true,
          },
        }));

        const result = await collection.bulkWrite(bulkOps);
        console.log(
          `Upserted ${result.upsertedCount + result.modifiedCount} contacts`
        );
      }
    } catch (error) {
      console.error("Contact sync failed:", error);
      throw error;
    }
  }

  async syncUsers(targetDbId?: string): Promise<void> {
    console.log(`Starting users sync for: ${this.dataSource.name}`);
    const { db } = await this.getMongoConnection(targetDbId);

    try {
      const users = await this.fetchCloseData("user");
      console.log(`Fetched ${users.length} users from Close.com`);

      const collection = db.collection("users");

      // Process users with data source reference
      const processedUsers = users.map((user) => ({
        ...user,
        _dataSourceId: this.dataSource.id,
        _dataSourceName: this.dataSource.name,
        _syncedAt: new Date(),
      }));

      if (processedUsers.length > 0) {
        const bulkOps = processedUsers.map((user) => ({
          replaceOne: {
            filter: { id: user.id, _dataSourceId: this.dataSource.id },
            replacement: user,
            upsert: true,
          },
        }));

        const result = await collection.bulkWrite(bulkOps);
        console.log(
          `Upserted ${result.upsertedCount + result.modifiedCount} users`
        );
      }
    } catch (error) {
      console.error("User sync failed:", error);
      throw error;
    }
  }

  async syncActivities(targetDbId?: string): Promise<void> {
    console.log(`Starting activities sync for: ${this.dataSource.name}`);
    const { db } = await this.getMongoConnection(targetDbId);

    try {
      const activities = await this.fetchCloseData("activity");
      console.log(`Fetched ${activities.length} activities from Close.com`);

      const collection = db.collection("activities");

      // Process activities with data source reference
      const processedActivities = activities.map((activity) => ({
        ...activity,
        _dataSourceId: this.dataSource.id,
        _dataSourceName: this.dataSource.name,
        _syncedAt: new Date(),
      }));

      if (processedActivities.length > 0) {
        const bulkOps = processedActivities.map((activity) => ({
          replaceOne: {
            filter: { id: activity.id, _dataSourceId: this.dataSource.id },
            replacement: activity,
            upsert: true,
          },
        }));

        const result = await collection.bulkWrite(bulkOps);
        console.log(
          `Upserted ${result.upsertedCount + result.modifiedCount} activities`
        );
      }
    } catch (error) {
      console.error("Activity sync failed:", error);
      throw error;
    }
  }

  async syncCustomFields(targetDbId?: string): Promise<void> {
    console.log(`Starting custom fields sync for: ${this.dataSource.name}`);
    const { db } = await this.getMongoConnection(targetDbId);

    try {
      // Fetch all custom field types
      const customFieldTypes = [
        "custom_fields/lead",
        "custom_fields/contact",
        "custom_fields/opportunity",
        "custom_fields/activity",
      ];

      const allCustomFields: any[] = [];

      for (const fieldType of customFieldTypes) {
        try {
          const fields = await this.fetchCloseData(fieldType);
          allCustomFields.push(
            ...fields.map((field: any) => ({
              ...field,
              field_type: fieldType.replace("custom_fields/", ""),
              _dataSourceId: this.dataSource.id,
              _dataSourceName: this.dataSource.name,
              _syncedAt: new Date(),
            }))
          );
        } catch (error) {
          console.warn(`Failed to fetch ${fieldType}:`, error);
          // Continue with other field types
        }
      }

      console.log(`Fetched ${allCustomFields.length} custom fields`);

      if (allCustomFields.length > 0) {
        const collection = db.collection("custom_fields");

        const bulkOps = allCustomFields.map((field) => ({
          replaceOne: {
            filter: {
              id: field.id,
              field_type: field.field_type,
              _dataSourceId: this.dataSource.id,
            },
            replacement: field,
            upsert: true,
          },
        }));

        const result = await collection.bulkWrite(bulkOps);
        console.log(
          `Upserted ${
            result.upsertedCount + result.modifiedCount
          } custom fields`
        );
      }
    } catch (error) {
      console.error("Custom fields sync failed:", error);
      throw error;
    }
  }

  async syncAll(targetDbId?: string): Promise<void> {
    console.log(`\n🔄 Starting full sync for data source: ${this.dataSource.name}`);
    console.log(`Target database: ${targetDbId || "analytics_db"}`);
    const startTime = Date.now();

    try {
      // Sync all data types
      await this.syncLeads(targetDbId);
      await this.syncOpportunities(targetDbId);
      await this.syncContacts(targetDbId);
      await this.syncActivities(targetDbId);
      await this.syncUsers(targetDbId);
      await this.syncCustomFields(targetDbId);

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(
        `✅ Full sync completed for ${this.dataSource.name} in ${duration}s`
      );
    } catch (error) {
      console.error(`❌ Sync failed for ${this.dataSource.name}:`, error);
      throw error;
    } finally {
      await this.disconnect();
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Load data source configuration
function loadDataSourceConfig(): DataSourceConfig[] {
  try {
    // Validate configuration first
    const validation = dataSourceManager.validateConfig();
    if (!validation.valid) {
      console.error("Configuration validation failed:");
      validation.errors.forEach((error) => console.error(`  - ${error}`));
      process.exit(1);
    }

    return dataSourceManager.getDataSourcesByType("close");
  } catch (error) {
    console.error("Failed to load configuration:", error);
    console.error(
      "Make sure config/config.yaml exists and environment variables are set"
    );
    process.exit(1);
  }
}

// Main execution
async function main() {
  const dataSources = loadDataSourceConfig();

  if (dataSources.length === 0) {
    console.log("No active Close.com data sources found.");
    process.exit(0);
  }

  console.log(`Found ${dataSources.length} active Close.com data source(s)`);

  // Check command line arguments
  const args = process.argv.slice(2);
  const targetDbId = args.find((arg) => arg.startsWith("--db="))?.split("=")[1];
  const specificSourceId = args.find((arg) => !arg.startsWith("--"));

  if (specificSourceId) {
    // Sync specific data source
    const source = dataSources.find((s) => s.id === specificSourceId);
    if (!source) {
      console.error(
        `Data source '${specificSourceId}' not found or not active`
      );
      console.log("\nAvailable Close.com data sources:");
      dataSources.forEach((s) => console.log(`  - ${s.id}: ${s.name}`));
      process.exit(1);
    }

    const syncService = new CloseSyncService(source);
    await syncService.syncAll(targetDbId);
  } else {
    // Sync all data sources
    for (const dataSource of dataSources) {
      const syncService = new CloseSyncService(dataSource);
      await syncService.syncAll(targetDbId);
    }
  }

  console.log("\n✅ All syncs completed successfully!");
}

// Execute if run directly
if (require.main === module) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

export { CloseSyncService };
