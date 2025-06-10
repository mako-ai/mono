import { config } from "dotenv";
import * as yaml from "yaml";
import * as fs from "fs";
import * as path from "path";
import mongoose, { Types } from "mongoose";
import { Database, Workspace, WorkspaceMember } from "../api/src/database/workspace-schema";
import * as crypto from "crypto";

// Load environment variables from root
config({ path: path.join(__dirname, "../.env") });

// Encryption helper (matching the one in workspace-schema.ts)
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString("hex");
const IV_LENGTH = 16;

function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(
    "aes-256-cbc",
    Buffer.from(ENCRYPTION_KEY, "hex"),
    iv
  );
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

function encryptObject(obj: any): any {
  const encrypted: any = {};
  for (const key in obj) {
    if (typeof obj[key] === "string" && obj[key]) {
      // Only encrypt sensitive fields
      const sensitiveFields = ["password", "connectionString", "privateKey", "username", "host"];
      if (sensitiveFields.includes(key)) {
        encrypted[key] = encrypt(obj[key]);
      } else {
        encrypted[key] = obj[key];
      }
    } else if (typeof obj[key] === "object" && obj[key] !== null) {
      encrypted[key] = encryptObject(obj[key]);
    } else {
      encrypted[key] = obj[key];
    }
  }
  return encrypted;
}

// Process environment variable substitution
function processEnvironmentVariables(str: string): string {
  const envVarPattern = /\$\{([^}]+)\}/g;
  return str.replace(envVarPattern, (match, varName) => {
    const value = process.env[varName];
    if (!value) {
      console.warn(`⚠️  Environment variable ${varName} is not set`);
      return match;
    }
    return value;
  });
}

interface ConfigFile {
  mongodb_servers?: {
    [key: string]: {
      name: string;
      description?: string;
      connection_string: string;
      active: boolean;
      databases: {
        [key: string]: {
          name: string;
          description?: string;
          database: string;
          active: boolean;
          settings?: any;
        };
      };
    };
  };
}

async function migrate(dryRun: boolean = false) {
  console.log("🚀 Starting database migration...\n");

  // Load config file
  const configPath = path.join(__dirname, "../config/config.yaml");
  if (!fs.existsSync(configPath)) {
    console.error("❌ Config file not found at", configPath);
    process.exit(1);
  }

  const configContent = fs.readFileSync(configPath, "utf8");
  const config: ConfigFile = yaml.parse(configContent);

  if (!config.mongodb_servers) {
    console.log("No MongoDB servers found in config file");
    return;
  }

  // Connect to MongoDB
  const mongoUri = process.env.DATABASE_URL;
  if (!mongoUri) {
    console.error("❌ DATABASE_URL environment variable is not set");
    process.exit(1);
  }

  try {
    await mongoose.connect(mongoUri);
    console.log("✅ Connected to MongoDB\n");
  } catch (error) {
    console.error("❌ Failed to connect to MongoDB:", error);
    process.exit(1);
  }

  // Get or create a default workspace
  let workspace = await Workspace.findOne().sort({ createdAt: 1 });
  let userId = "migration-user";

  if (!workspace) {
    console.log("📁 Creating default workspace...");
    if (!dryRun) {
      workspace = await Workspace.create({
        name: "Default Workspace",
        slug: "default",
        createdBy: userId,
        settings: {
          maxDatabases: 100,
          maxMembers: 50,
          billingTier: "pro"
        }
      });

      // Add the migration user as owner
      await WorkspaceMember.create({
        workspaceId: workspace._id,
        userId: userId,
        role: "owner"
      });
    }
    console.log("✅ Created default workspace\n");
  } else {
    // Get the first owner of the workspace
    const owner = await WorkspaceMember.findOne({ 
      workspaceId: workspace._id, 
      role: "owner" 
    });
    if (owner) {
      userId = owner.userId;
    }
  }

  // Migrate databases
  let migrated = 0;
  let failed = 0;
  const results: { name: string; status: string; error?: string }[] = [];

  for (const [serverId, server] of Object.entries(config.mongodb_servers)) {
    if (!server.active) continue;

    console.log(`\n📦 Processing server: ${server.name} (${serverId})`);

    for (const [dbId, db] of Object.entries(server.databases || {})) {
      if (!db.active) continue;

      const dbName = `${server.name} - ${db.name}`;
      console.log(`  📄 Migrating database: ${db.name}`);

      try {
        // Process environment variables in connection string
        const connectionString = processEnvironmentVariables(server.connection_string);

        // Parse connection string to extract parts
        let parsedUrl: URL;
        let host = "localhost";
        let port = 27017;
        let username: string | undefined;
        let password: string | undefined;
        let databaseName = db.database;

        try {
          // Handle mongodb:// and mongodb+srv:// URLs
          if (connectionString.startsWith("mongodb+srv://")) {
            // For SRV connections, we'll store the full connection string
            parsedUrl = new URL(connectionString.replace("mongodb+srv://", "https://"));
          } else {
            parsedUrl = new URL(connectionString.replace("mongodb://", "https://"));
          }

          username = parsedUrl.username || undefined;
          password = parsedUrl.password || undefined;
          host = parsedUrl.hostname;
          port = parsedUrl.port ? parseInt(parsedUrl.port) : 27017;

          // Extract database from pathname if present
          if (parsedUrl.pathname && parsedUrl.pathname !== "/") {
            databaseName = parsedUrl.pathname.substring(1).split("?")[0] || databaseName;
          }
        } catch (error) {
          console.warn("    ⚠️  Could not parse connection string, storing as-is");
        }

        // Prepare connection object
        const connection: any = {
          database: databaseName,
        };

        // For mongodb+srv or complex connection strings, store the full string
        if (connectionString.startsWith("mongodb+srv://") || connectionString.includes("replicaSet")) {
          connection.connectionString = connectionString;
        } else {
          // Store individual connection parameters
          connection.host = host;
          connection.port = port;
          if (username) connection.username = username;
          if (password) connection.password = password;
        }

        // Add additional MongoDB-specific options
        if (connectionString.includes("ssl=true")) {
          connection.ssl = true;
        }

        const authSourceMatch = connectionString.match(/authSource=([^&]+)/);
        if (authSourceMatch) {
          connection.authSource = authSourceMatch[1];
        }

        const replicaSetMatch = connectionString.match(/replicaSet=([^&]+)/);
        if (replicaSetMatch) {
          connection.replicaSet = replicaSetMatch[1];
        }

        if (dryRun) {
          console.log(`    ℹ️  [DRY RUN] Would create database:`);
          console.log(`       Name: ${dbName}`);
          console.log(`       Type: mongodb`);
          console.log(`       Database: ${databaseName}`);
          console.log(`       Connection: ${connectionString.includes("mongodb+srv") ? "SRV" : "Standard"}`);
          results.push({ name: dbName, status: "Would create" });
        } else {
          // Check if database already exists
          const existing = await Database.findOne({
            workspaceId: workspace!._id,
            name: dbName,
            type: "mongodb"
          });

          if (existing) {
            console.log(`    ⚠️  Database already exists, skipping`);
            results.push({ name: dbName, status: "Already exists" });
            continue;
          }

          // Create the database document with encrypted connection details
          const encryptedConnection = encryptObject(connection);
          
          await Database.create({
            workspaceId: workspace!._id,
            name: dbName,
            type: "mongodb",
            connection: encryptedConnection,
            createdBy: userId,
            createdAt: new Date(),
            updatedAt: new Date()
          });

          console.log(`    ✅ Successfully migrated`);
          results.push({ name: dbName, status: "Migrated" });
          migrated++;
        }
      } catch (error) {
        console.error(`    ❌ Failed to migrate:`, error);
        results.push({ 
          name: dbName, 
          status: "Failed", 
          error: error instanceof Error ? error.message : String(error) 
        });
        failed++;
      }
    }
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("📊 Migration Summary");
  console.log("=".repeat(60));
  
  if (dryRun) {
    console.log("\n🔍 DRY RUN MODE - No changes were made\n");
  }

  console.log(`Workspace: ${workspace?.name || "Default Workspace"} (${workspace?._id || "to be created"})`);
  console.log(`Total databases found: ${results.length}`);
  if (!dryRun) {
    console.log(`Successfully migrated: ${migrated}`);
    console.log(`Failed: ${failed}`);
  }

  console.log("\nDetails:");
  results.forEach(result => {
    const icon = result.status === "Migrated" ? "✅" : 
                 result.status === "Failed" ? "❌" : 
                 result.status === "Already exists" ? "⚠️" : "ℹ️";
    console.log(`  ${icon} ${result.name}: ${result.status}`);
    if (result.error) {
      console.log(`     Error: ${result.error}`);
    }
  });

  if (!dryRun && migrated > 0) {
    console.log("\n✨ Next steps:");
    console.log("  1. Test database connections in the application");
    console.log("  2. Update API endpoints to use MongoDB-stored databases");
    console.log("  3. Remove database configuration from config.yaml");
    console.log("  4. Deploy the updated code");
  }

  // Disconnect from MongoDB
  await mongoose.disconnect();
  console.log("\n✅ Migration complete!");
}

// Parse command line arguments
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run") || args.includes("-d");

// Run migration
migrate(dryRun).catch(error => {
  console.error("❌ Migration failed:", error);
  process.exit(1);
});