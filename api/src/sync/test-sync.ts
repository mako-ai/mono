/* eslint-disable no-process-exit */
import { databaseDataSourceManager } from "./database-data-source-manager";

async function testSync() {
  console.log("🧪 Testing database-based sync functionality...\n");

  try {
    // Test database connection
    console.log("1. Testing data source manager connection...");
    const validation = databaseDataSourceManager.validateConfig();
    if (!validation.valid) {
      console.error("❌ Configuration validation failed:");
      validation.errors.forEach(error => console.error(`  - ${error}`));
      return;
    }
    console.log("✅ Configuration validation passed\n");

    // List available data sources
    console.log("2. Listing available data sources...");
    const dataSources = await databaseDataSourceManager.getActiveDataSources();

    if (dataSources.length === 0) {
      console.log("⚠️  No active data sources found in database");
      console.log("   Make sure you have created data sources in your app");
      return;
    }

    console.log(`Found ${dataSources.length} active data source(s):`);
    dataSources.forEach(source => {
      console.log(`  - ${source.name} (${source.type}) - ID: ${source.id}`);
    });
    console.log();

    // Test getting a specific data source
    if (dataSources.length > 0) {
      const firstSource = dataSources[0];
      console.log("3. Testing data source retrieval...");

      const retrievedSource = await databaseDataSourceManager.getDataSource(
        firstSource.id,
      );
      if (retrievedSource) {
        console.log(
          `✅ Successfully retrieved data source: ${retrievedSource.name}`,
        );
        console.log(`   Type: ${retrievedSource.type}`);
        console.log(`   Active: ${retrievedSource.active}`);

        // Check if connection config is properly decrypted
        if (retrievedSource.connection.api_key) {
          const keyPreview =
            retrievedSource.connection.api_key.substring(0, 10) + "...";
          console.log(`   API Key: ${keyPreview}`);
        }
      } else {
        console.error("❌ Failed to retrieve data source");
      }
      console.log();
    }

    // Test data sources by type
    const stripeSourceCount =
      await databaseDataSourceManager.getDataSourcesByType("stripe");
    const closeSourceCount =
      await databaseDataSourceManager.getDataSourcesByType("close");
    const graphqlSourceCount =
      await databaseDataSourceManager.getDataSourcesByType("graphql");

    console.log("4. Data sources by type:");
    console.log(`   Stripe sources: ${stripeSourceCount.length}`);
    console.log(`   Close sources: ${closeSourceCount.length}`);
    console.log(`   GraphQL sources: ${graphqlSourceCount.length}`);
    console.log();

    console.log(
      "✅ All tests passed! Your sync scripts should work with database-based connectors.",
    );
    console.log("\nTo run a sync, use:");
    console.log("  pnpm run sync <source_id> <destination> [entity]");
    console.log("\nExample:");
    if (dataSources.length > 0) {
      const exampleSource = dataSources[0];
      console.log(`  pnpm run sync "${exampleSource.id}" RevOps`);
      if (exampleSource.type === "stripe") {
        console.log(`  pnpm run sync "${exampleSource.id}" RevOps customers`);
      } else if (exampleSource.type === "close") {
        console.log(`  pnpm run sync "${exampleSource.id}" RevOps leads`);
      }
    }
  } catch (error) {
    console.error("❌ Test failed:", error);
    console.error("\nPlease check:");
    console.error("1. DATABASE_URL environment variable is set");
    console.error("2. ENCRYPTION_KEY environment variable is set");
    console.error("3. Database connection is working");
    console.error("4. Data sources exist in the 'datasources' collection");
  }
}

// Execute test
if (require.main === module) {
  testSync().catch(error => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

export { testSync };
