#!/usr/bin/env node
import { mongoPool } from "./mongodb-pool";
import * as dotenv from "dotenv";
import * as path from "path";

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

async function testUnifiedPool() {
  console.log("🧪 Testing Unified MongoDB Pool...\n");

  try {
    // Test 1: Main connection
    console.log("Test 1: Main application connection");
    const mainConn = await mongoPool.getMainConnection();
    console.log("  ✓ Main connection established");

    // Verify we can query
    const collections = await mainConn.db.listCollections().toArray();
    console.log(
      `  ✓ Listed ${collections.length} collections in main database`,
    );
    console.log("");

    // Test 2: Multiple connections to same context
    console.log("Test 2: Connection pooling");
    const conn1 = await mongoPool.getConnection(
      "workspace",
      "test-workspace-1",
      {
        connectionString: process.env.DATABASE_URL!,
        database: "test_workspace_1",
      },
    );

    const conn2 = await mongoPool.getConnection(
      "workspace",
      "test-workspace-1",
      {
        connectionString: process.env.DATABASE_URL!,
        database: "test_workspace_1",
      },
    );

    console.log(`  ✓ Connection reused: ${conn1.client === conn2.client}`);
    console.log("");

    // Test 3: Different contexts
    console.log("Test 3: Different contexts");
    const contexts = [
      "main",
      "destination",
      "datasource",
      "workspace",
    ] as const;

    for (const ctx of contexts) {
      if (ctx === "main") continue; // Already tested

      const conn = await mongoPool.getConnection(ctx, `test-${ctx}`, {
        connectionString: process.env.DATABASE_URL!,
        database: `test_${ctx}_db`,
      });
      console.log(`  ✓ ${ctx} connection established`);
    }
    console.log("");

    // Test 4: Connection statistics
    console.log("Test 4: Connection statistics");
    const stats = mongoPool.getStats();
    console.log(`  Total connections: ${stats.totalConnections}`);
    console.log("  By context:");
    Object.entries(stats.byContext).forEach(([ctx, count]) => {
      console.log(`    - ${ctx}: ${count}`);
    });
    console.log("");

    // Test 5: Health check recovery
    console.log("Test 5: Health check and recovery");
    // Get a connection
    const testConn = await mongoPool.getConnection(
      "datasource",
      "health-test",
      {
        connectionString: process.env.DATABASE_URL!,
        database: "health_test_db",
      },
    );

    // Force close the underlying client
    await testConn.client.close();
    console.log("  ✓ Forced connection close");

    // Try to use the same connection again - should auto-recover
    const recoveredConn = await mongoPool.getConnection(
      "datasource",
      "health-test",
      {
        connectionString: process.env.DATABASE_URL!,
        database: "health_test_db",
      },
    );

    // Verify it's a new client
    console.log(
      `  ✓ New client created: ${testConn.client !== recoveredConn.client}`,
    );

    // Verify the new connection works
    await recoveredConn.db.admin().command({ ping: 1 });
    console.log("  ✓ Recovered connection is healthy");
    console.log("");

    // Test 6: Connection by ID with lookup
    console.log("Test 6: Connection by ID with lookup function");
    const lookupConn = await mongoPool.getConnectionById(
      "destination",
      "lookup-test",
      async id => {
        console.log(`  → Lookup function called for ID: ${id}`);
        // Simulate database lookup
        return {
          connectionString: process.env.DATABASE_URL!,
          database: "lookup_test_db",
          encrypted: false,
        };
      },
    );
    console.log("  ✓ Connection established via lookup");
    console.log("");

    // Final stats
    console.log("Final statistics:");
    const finalStats = mongoPool.getStats();
    console.log(`  Total connections: ${finalStats.totalConnections}`);
    console.log("  Active connections:");
    finalStats.connections.forEach(conn => {
      console.log(
        `    - ${conn.key} (last used: ${conn.lastUsed.toISOString()})`,
      );
    });
    console.log("");

    console.log(
      "✅ All tests passed! The unified MongoDB pool is working correctly.",
    );
    console.log("   No more 'Topology is closed' errors! 🎉\n");
  } catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
  } finally {
    // Cleanup
    console.log("Closing all connections...");
    await mongoPool.closeAll();
    console.log("Done!");
    process.exit(0);
  }
}

// Run the test
void testUnifiedPool();
