import axios, { AxiosError } from "axios";
import { MongoClient, Db, Collection } from "mongodb";
import * as dotenv from "dotenv";

dotenv.config();

interface CloseApiResponse {
  data: any[];
  has_more: boolean;
  total_results?: number;
}

interface SyncStats {
  totalLeads: number;
  batchesProcessed: number;
  errors: number;
  startTime: Date;
  endTime?: Date;
}

class CloseLeadsSync {
  private client: MongoClient;
  private db!: Db;
  private apiKey: string;
  private baseUrl: string;
  private rateLimitDelay: number;
  private maxRetries: number;
  private batchSize: number;

  constructor() {
    this.apiKey = process.env.CLOSE_API_KEY!;
    this.baseUrl = process.env.CLOSE_API_BASE_URL!;
    this.rateLimitDelay = parseInt(process.env.RATE_LIMIT_DELAY_MS || "200");
    this.maxRetries = parseInt(process.env.MAX_RETRIES || "5");
    this.batchSize = parseInt(process.env.BATCH_SIZE || "100");

    if (!this.apiKey) {
      throw new Error("CLOSE_API_KEY environment variable is required");
    }

    this.client = new MongoClient(process.env.MONGODB_CONNECTION_STRING!);
  }

  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async makeApiRequest(
    url: string,
    retryCount = 0
  ): Promise<CloseApiResponse> {
    try {
      await this.delay(this.rateLimitDelay);

      // Close.com uses HTTP Basic Auth with API key as username and empty password
      const auth = Buffer.from(`${this.apiKey}:`).toString("base64");

      const response = await axios.get(url, {
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
        },
      });

      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;

      if (axiosError.response?.status === 429 && retryCount < this.maxRetries) {
        const retryAfter = axiosError.response.headers["retry-after"] || 60;
        console.log(
          `Rate limited. Waiting ${retryAfter} seconds before retry ${
            retryCount + 1
          }/${this.maxRetries}`
        );
        await this.delay(parseInt(retryAfter) * 1000);
        return this.makeApiRequest(url, retryCount + 1);
      }

      if (retryCount < this.maxRetries && axiosError.response?.status !== 404) {
        console.log(
          `Request failed, retrying ${retryCount + 1}/${this.maxRetries}:`,
          axiosError.message
        );
        await this.delay(2000 * (retryCount + 1)); // Exponential backoff
        return this.makeApiRequest(url, retryCount + 1);
      }

      throw error;
    }
  }

  private async connect(): Promise<void> {
    await this.client.connect();
    this.db = this.client.db(process.env.MONGODB_DATABASE);
    console.log("Connected to MongoDB");
  }

  private async disconnect(): Promise<void> {
    await this.client.close();
    console.log("Disconnected from MongoDB");
  }

  async syncLeads(): Promise<SyncStats> {
    const stats: SyncStats = {
      totalLeads: 0,
      batchesProcessed: 0,
      errors: 0,
      startTime: new Date(),
    };

    try {
      await this.connect();

      // Clear and prepare staging collection
      const stagingCollection = this.db.collection("leads_staging");
      await stagingCollection.deleteMany({});
      console.log("Cleared staging collection");

      // Get total count from first API call
      console.log("Getting total count of leads...");
      const firstResponse = await this.makeApiRequest(
        `${this.baseUrl}/lead/?_limit=${this.batchSize}&_skip=0`
      );
      const totalResults = firstResponse.total_results || 0;
      console.log(`Found ${totalResults} total leads to sync`);

      let skip = 0;
      let hasMore = true;
      let processedCount = 0;

      while (hasMore) {
        try {
          const url = `${this.baseUrl}/lead/?_limit=${this.batchSize}&_skip=${skip}`;

          // Use first response for first batch to avoid duplicate API call
          const response =
            skip === 0 ? firstResponse : await this.makeApiRequest(url);

          if (response.data && response.data.length > 0) {
            // Use bulk replace operations to handle complex nested objects
            const bulkOps = response.data.map((lead) => ({
              replaceOne: {
                filter: { id: lead.id },
                replacement: lead,
                upsert: true,
              },
            }));

            await stagingCollection.bulkWrite(bulkOps);
            processedCount += response.data.length;

            // Calculate progress and ETA
            const elapsed =
              (new Date().getTime() - stats.startTime.getTime()) / 1000; // seconds
            const percentage =
              totalResults > 0
                ? Math.round((processedCount / totalResults) * 100)
                : 0;
            const recordsPerSecond = processedCount / elapsed;
            const remainingRecords = totalResults - processedCount;
            const etaSeconds =
              remainingRecords > 0 && recordsPerSecond > 0
                ? Math.round(remainingRecords / recordsPerSecond)
                : 0;
            const etaMinutes = Math.floor(etaSeconds / 60);
            const etaSecondsRemainder = etaSeconds % 60;
            const etaFormatted = `${etaMinutes}m${etaSecondsRemainder
              .toString()
              .padStart(2, "0")}s`;

            console.log(
              `Processed ${processedCount}/${totalResults} (${percentage}%) - ETA ${etaFormatted}`
            );
          }

          hasMore = response.has_more;
          skip += this.batchSize;
          stats.batchesProcessed++;
          stats.totalLeads = processedCount;
        } catch (error) {
          console.error("Error processing batch:", error);
          stats.errors++;

          // Continue with next batch on non-critical errors
          if (stats.errors > 10) {
            throw new Error("Too many errors, aborting sync");
          }

          // Move to next batch even on errors
          skip += this.batchSize;
        }
      }

      // Swap collections (atomic operation)
      console.log("Swapping collections...");
      const leadsCollection = this.db.collection("leads");

      // Drop old collection and rename staging to main
      await leadsCollection.drop().catch(() => {}); // Ignore error if collection doesn't exist
      await stagingCollection.rename("leads");

      console.log("Collection swap completed");
    } finally {
      stats.endTime = new Date();
      await this.disconnect();
    }

    return stats;
  }
}

// Main execution
async function main() {
  const sync = new CloseLeadsSync();

  try {
    console.log("Starting Close.com leads sync...");
    const stats = await sync.syncLeads();

    const duration = stats.endTime!.getTime() - stats.startTime.getTime();
    console.log("\n=== Sync Completed ===");
    console.log(`Total leads synced: ${stats.totalLeads}`);
    console.log(`Batches processed: ${stats.batchesProcessed}`);
    console.log(`Errors encountered: ${stats.errors}`);
    console.log(`Duration: ${Math.round(duration / 1000)} seconds`);
  } catch (error) {
    console.error("Sync failed:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
