// Migration script to move data sources from tenants.yaml to the database
const { MongoClient } = require("mongodb");
const yaml = require("js-yaml");
const fs = require("fs");
const path = require("path");

// Load configuration
function loadConfig() {
  const mongoUrl =
    process.env.MONGODB_CONNECTION_STRING || "mongodb://localhost:27018";
  const database = process.env.MONGODB_DATABASE || "multi_tenant_analytics";

  return {
    mongodb: {
      connection_string: mongoUrl,
      database: database,
    },
  };
}

async function migrateTenants() {
  const config = loadConfig();
  const client = new MongoClient(config.mongodb.connection_string);

  try {
    console.log("🚀 Starting tenant data migration...");

    // Connect to MongoDB
    await client.connect();
    const db = client.db(config.mongodb.database);
    const collection = db.collection("data_sources");

    // Read tenants.yaml file
    const tenantsPath = path.join(__dirname, "..", "config", "tenants.yaml");

    if (!fs.existsSync(tenantsPath)) {
      console.error("❌ tenants.yaml file not found at:", tenantsPath);
      return;
    }

    const tenantsData = yaml.load(fs.readFileSync(tenantsPath, "utf8"));
    const tenants = tenantsData.tenants;

    if (!tenants) {
      console.error("❌ No tenants found in tenants.yaml");
      return;
    }

    const dataSources = [];

    // Convert each tenant's sources to data sources
    for (const [tenantKey, tenantConfig] of Object.entries(tenants)) {
      console.log(`📋 Processing tenant: ${tenantKey}`);

      if (!tenantConfig.sources) {
        console.log(`⚠️  No sources found for tenant: ${tenantKey}`);
        continue;
      }

      for (const [sourceType, sourceConfig] of Object.entries(
        tenantConfig.sources
      )) {
        if (!sourceConfig.enabled) {
          console.log(
            `⚠️  Skipping disabled source: ${sourceType} for tenant ${tenantKey}`
          );
          continue;
        }

        const dataSource = {
          name: `${tenantConfig.name} - ${
            sourceType.charAt(0).toUpperCase() + sourceType.slice(1)
          }`,
          description: `${
            sourceType.charAt(0).toUpperCase() + sourceType.slice(1)
          } integration for ${tenantConfig.description || tenantConfig.name}`,
          source: sourceType,
          enabled: sourceConfig.enabled || true,
          config: {
            api_key: sourceConfig.api_key,
            api_base_url: sourceConfig.api_base_url,
          },
          settings: {
            sync_batch_size: tenantConfig.settings?.sync_batch_size || 100,
            rate_limit_delay_ms:
              tenantConfig.settings?.rate_limit_delay_ms || 200,
            max_retries: 3,
            timeout_ms: 30000,
          },
          tenant: tenantKey,
          created_at: new Date(),
          updated_at: new Date(),
        };

        // Remove undefined values from config
        Object.keys(dataSource.config).forEach((key) => {
          if (dataSource.config[key] === undefined) {
            delete dataSource.config[key];
          }
        });

        dataSources.push(dataSource);
        console.log(`✅ Prepared data source: ${dataSource.name}`);
      }
    }

    if (dataSources.length === 0) {
      console.log("⚠️  No data sources to migrate");
      return;
    }

    // Check if any data sources already exist
    const existingCount = await collection.countDocuments();
    if (existingCount > 0) {
      console.log(
        `⚠️  Found ${existingCount} existing data sources in the database`
      );
      console.log(
        "🤔 Do you want to proceed? This will add new data sources alongside existing ones."
      );
      console.log("💡 To start fresh, drop the data_sources collection first.");
    }

    // Insert data sources
    console.log(`📥 Inserting ${dataSources.length} data sources...`);
    const result = await collection.insertMany(dataSources);

    console.log(`✅ Migration completed successfully!`);
    console.log(`📊 Inserted ${result.insertedCount} data sources`);
    console.log("\n📋 Summary:");

    // Show summary
    const sourceTypeCounts = {};
    dataSources.forEach((ds) => {
      sourceTypeCounts[ds.source] = (sourceTypeCounts[ds.source] || 0) + 1;
    });

    Object.entries(sourceTypeCounts).forEach(([source, count]) => {
      console.log(`   ${source}: ${count} source(s)`);
    });

    console.log(
      "\n🎉 You can now manage your data sources through the web interface!"
    );
    console.log(
      "💡 Navigate to /sources in your application to view and manage them."
    );
  } catch (error) {
    console.error("❌ Migration failed:", error);
  } finally {
    await client.close();
  }
}

// Run migration
if (require.main === module) {
  migrateTenants().catch(console.error);
}

module.exports = { migrateTenants };
