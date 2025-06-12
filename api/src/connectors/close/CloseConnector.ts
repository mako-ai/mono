import {
  BaseConnector,
  ConnectionTestResult,
  SyncOptions,
} from "../base/BaseConnector";
import { MongoClient } from "mongodb";
import axios, { AxiosInstance } from "axios";

export class CloseConnector extends BaseConnector {
  private closeApi: AxiosInstance | null = null;

  getMetadata() {
    return {
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
    };
  }

  validateConfig() {
    const base = super.validateConfig();
    const errors = [...base.errors];

    if (!this.dataSource.config.api_key) {
      errors.push("Close API key is required");
    }

    return { valid: errors.length === 0, errors };
  }

  private getCloseClient(): AxiosInstance {
    if (!this.closeApi) {
      if (!this.dataSource.config.api_key) {
        throw new Error("Close API key not configured");
      }

      this.closeApi = axios.create({
        baseURL: "https://api.close.com/api/v1",
        auth: {
          username: this.dataSource.config.api_key,
          password: "",
        },
        headers: {
          "Content-Type": "application/json",
        },
      });
    }
    return this.closeApi;
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

      const api = this.getCloseClient();

      // Test connection by fetching user info
      await api.get("/me/");

      return {
        success: true,
        message: "Successfully connected to Close API",
      };
    } catch (error) {
      return {
        success: false,
        message: "Failed to connect to Close API",
        details: axios.isAxiosError(error) ? error.message : String(error),
      };
    }
  }

  getAvailableEntities(): string[] {
    return [
      "leads",
      "opportunities",
      "activities",
      "contacts",
      "users",
      "custom_fields",
    ];
  }

  async syncAll(options: SyncOptions): Promise<void> {
    const entities = this.getAvailableEntities();
    for (const entity of entities) {
      await this.syncEntity(entity, options);
    }
  }

  async syncEntity(entity: string, options: SyncOptions): Promise<void> {
    const { targetDatabase, progress } = options;

    if (!targetDatabase) {
      throw new Error("Target database is required for sync");
    }

    switch (entity.toLowerCase()) {
      case "leads":
        await this.syncLeads(targetDatabase, progress);
        break;
      case "opportunities":
        await this.syncOpportunities(targetDatabase, progress);
        break;
      case "activities":
        await this.syncActivities(targetDatabase, progress);
        break;
      case "contacts":
        await this.syncContacts(targetDatabase, progress);
        break;
      case "users":
        await this.syncUsers(targetDatabase, progress);
        break;
      case "custom_fields":
        await this.syncCustomFields(targetDatabase, progress);
        break;
      default:
        throw new Error(`Unknown entity: ${entity}`);
    }
  }

  private async syncLeads(targetDb: any, progress?: any) {
    const api = this.getCloseClient();
    const batchSize = this.getBatchSize();
    const delay = this.getRateLimitDelay();

    const client = new MongoClient(targetDb.connection.connection_string);
    await client.connect();
    const db = client.db(targetDb.connection.database);
    const collection = db.collection("close_leads");

    try {
      let hasMore = true;
      let offset = 0;
      let totalSynced = 0;

      while (hasMore) {
        const response = await api.get("/lead/", {
          params: {
            _limit: batchSize,
            _skip: offset,
          },
        });

        const leads = response.data.data;

        if (leads.length > 0) {
          const documents = leads.map((lead: any) => ({
            closeId: lead.id,
            ...lead,
            _syncedAt: new Date(),
            _dataSourceId: this.dataSource._id.toString(),
          }));

          await collection.bulkWrite(
            documents.map((doc: any) => ({
              replaceOne: {
                filter: { closeId: doc.closeId },
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

        hasMore = response.data.has_more;
        offset += batchSize;

        if (hasMore) {
          await this.sleep(delay);
        }
      }

      if (progress) {
        progress.reportComplete();
      }

      console.log(`✓ Synced ${totalSynced} leads`);
    } finally {
      await client.close();
    }
  }

  private async syncOpportunities(targetDb: any, progress?: any) {
    const api = this.getCloseClient();
    const batchSize = this.getBatchSize();
    const delay = this.getRateLimitDelay();

    const client = new MongoClient(targetDb.connection.connection_string);
    await client.connect();
    const db = client.db(targetDb.connection.database);
    const collection = db.collection("close_opportunities");

    try {
      let hasMore = true;
      let offset = 0;
      let totalSynced = 0;

      while (hasMore) {
        const response = await api.get("/opportunity/", {
          params: {
            _limit: batchSize,
            _skip: offset,
          },
        });

        const opportunities = response.data.data;

        if (opportunities.length > 0) {
          const documents = opportunities.map((opportunity: any) => ({
            closeId: opportunity.id,
            ...opportunity,
            _syncedAt: new Date(),
            _dataSourceId: this.dataSource._id.toString(),
          }));

          await collection.bulkWrite(
            documents.map((doc: any) => ({
              replaceOne: {
                filter: { closeId: doc.closeId },
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

        hasMore = response.data.has_more;
        offset += batchSize;

        if (hasMore) {
          await this.sleep(delay);
        }
      }

      if (progress) {
        progress.reportComplete();
      }

      console.log(`✓ Synced ${totalSynced} opportunities`);
    } finally {
      await client.close();
    }
  }

  private async syncActivities(targetDb: any, progress?: any) {
    const api = this.getCloseClient();
    const batchSize = this.getBatchSize();
    const delay = this.getRateLimitDelay();

    const client = new MongoClient(targetDb.connection.connection_string);
    await client.connect();
    const db = client.db(targetDb.connection.database);
    const collection = db.collection("close_activities");

    try {
      let hasMore = true;
      let offset = 0;
      let totalSynced = 0;

      while (hasMore) {
        const response = await api.get("/activity/", {
          params: {
            _limit: batchSize,
            _skip: offset,
          },
        });

        const activities = response.data.data;

        if (activities.length > 0) {
          const documents = activities.map((activity: any) => ({
            closeId: activity.id,
            ...activity,
            _syncedAt: new Date(),
            _dataSourceId: this.dataSource._id.toString(),
          }));

          await collection.bulkWrite(
            documents.map((doc: any) => ({
              replaceOne: {
                filter: { closeId: doc.closeId },
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

        hasMore = response.data.has_more;
        offset += batchSize;

        if (hasMore) {
          await this.sleep(delay);
        }
      }

      if (progress) {
        progress.reportComplete();
      }

      console.log(`✓ Synced ${totalSynced} activities`);
    } finally {
      await client.close();
    }
  }

  private async syncContacts(targetDb: any, progress?: any) {
    const api = this.getCloseClient();
    const batchSize = this.getBatchSize();
    const delay = this.getRateLimitDelay();

    const client = new MongoClient(targetDb.connection.connection_string);
    await client.connect();
    const db = client.db(targetDb.connection.database);
    const collection = db.collection("close_contacts");

    try {
      let hasMore = true;
      let offset = 0;
      let totalSynced = 0;

      while (hasMore) {
        const response = await api.get("/contact/", {
          params: {
            _limit: batchSize,
            _skip: offset,
          },
        });

        const contacts = response.data.data;

        if (contacts.length > 0) {
          const documents = contacts.map((contact: any) => ({
            closeId: contact.id,
            ...contact,
            _syncedAt: new Date(),
            _dataSourceId: this.dataSource._id.toString(),
          }));

          await collection.bulkWrite(
            documents.map((doc: any) => ({
              replaceOne: {
                filter: { closeId: doc.closeId },
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

        hasMore = response.data.has_more;
        offset += batchSize;

        if (hasMore) {
          await this.sleep(delay);
        }
      }

      if (progress) {
        progress.reportComplete();
      }

      console.log(`✓ Synced ${totalSynced} contacts`);
    } finally {
      await client.close();
    }
  }

  private async syncUsers(targetDb: any, progress?: any) {
    const api = this.getCloseClient();
    const batchSize = this.getBatchSize();
    const delay = this.getRateLimitDelay();

    const client = new MongoClient(targetDb.connection.connection_string);
    await client.connect();
    const db = client.db(targetDb.connection.database);
    const collection = db.collection("close_users");

    try {
      let hasMore = true;
      let offset = 0;
      let totalSynced = 0;

      while (hasMore) {
        const response = await api.get("/user/", {
          params: {
            _limit: batchSize,
            _skip: offset,
          },
        });

        const users = response.data.data;

        if (users.length > 0) {
          const documents = users.map((user: any) => ({
            closeId: user.id,
            ...user,
            _syncedAt: new Date(),
            _dataSourceId: this.dataSource._id.toString(),
          }));

          await collection.bulkWrite(
            documents.map((doc: any) => ({
              replaceOne: {
                filter: { closeId: doc.closeId },
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

        hasMore = response.data.has_more;
        offset += batchSize;

        if (hasMore) {
          await this.sleep(delay);
        }
      }

      if (progress) {
        progress.reportComplete();
      }

      console.log(`✓ Synced ${totalSynced} users`);
    } finally {
      await client.close();
    }
  }

  private async syncCustomFields(targetDb: any, progress?: any) {
    const api = this.getCloseClient();

    const client = new MongoClient(targetDb.connection.connection_string);
    await client.connect();
    const db = client.db(targetDb.connection.database);
    const collection = db.collection("close_custom_fields");

    try {
      // Custom fields don't paginate the same way
      const response = await api.get("/custom_field/");
      const customFields = response.data.data;

      if (customFields.length > 0) {
        const documents = customFields.map((field: any) => ({
          closeId: field.id,
          ...field,
          _syncedAt: new Date(),
          _dataSourceId: this.dataSource._id.toString(),
        }));

        await collection.bulkWrite(
          documents.map((doc: any) => ({
            replaceOne: {
              filter: { closeId: doc.closeId },
              replacement: doc,
              upsert: true,
            },
          })),
        );

        if (progress) {
          progress.reportBatch(documents.length);
          progress.reportComplete();
        }

        console.log(`✓ Synced ${documents.length} custom fields`);
      }
    } finally {
      await client.close();
    }
  }
}
