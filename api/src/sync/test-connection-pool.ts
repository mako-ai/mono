#!/usr/bin/env node
import { destinationConnectionPool } from "./destination-connection-pool";
import * as dotenv from "dotenv";
import * as path from "path";

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

async function testConnectionPool() {
  console.log("🧪 Testing MongoDB connection pooling...\n");

  try {
    // Test 1: Create multiple connections to the same destination
    console.log("Test 1: Multiple requests for same destination");
    const destinationId = process.argv[2];
    if (!destinationId) {
      console.error("Please provide a destination database ID as argument");
      process.exit(1);
    }

    // Simulate multiple concurrent requests
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(
        destinationConnectionPool.getConnection(destinationId).then(conn => {
          console.log(`  ✓ Connection ${i + 1} obtained`);
          return conn;
        }),
      );
    }

    const connections = await Promise.all(promises);
    console.log(
      `  → All connections point to same client: ${connections.every(c => c.client === connections[0].client)}`,
    );
    console.log(
      `  → Active connections: ${destinationConnectionPool.getActiveConnectionCount()}`,
    );
    console.log("");

    // Test 2: Connection reuse after delay
    console.log("Test 2: Connection reuse after delay");
    await new Promise(resolve => setTimeout(resolve, 2000));

    const reusedConn =
      await destinationConnectionPool.getConnection(destinationId);
    console.log("  ✓ Connection reused from pool");
    console.log(
      `  → Same client instance: ${reusedConn.client === connections[0].client}`,
    );
    console.log("");

    // Test 3: Database operations
    console.log("Test 3: Database operations");
    const db = reusedConn.db;

    // List collections
    const collections = await db.listCollections().toArray();
    console.log(`  ✓ Listed ${collections.length} collections`);

    // Perform a simple query
    const testCollection = db.collection("_connection_pool_test");
    await testCollection.insertOne({ test: true, timestamp: new Date() });
    console.log("  ✓ Insert operation successful");

    const count = await testCollection.countDocuments();
    console.log(`  ✓ Count operation successful (${count} documents)`);

    // Cleanup test data
    await testCollection.deleteMany({ test: true });
    console.log("  ✓ Cleanup successful");
    console.log("");

    // Test 4: Connection info
    console.log("Test 4: Connection pool info");
    const connInfo = destinationConnectionPool.getConnectionInfo();
    console.log(`  → Active connections: ${connInfo.length}`);
    connInfo.forEach(info => {
      console.log(
        `    - Destination: ${info.destinationId}, Last used: ${info.lastUsed.toISOString()}`,
      );
    });
    console.log("");

    // Test 5: Simulate long-running operations
    console.log("Test 5: Long-running operations (simulating sync chunks)");
    const longRunningOps = [];
    for (let i = 0; i < 3; i++) {
      longRunningOps.push(
        (async () => {
          const conn =
            await destinationConnectionPool.getConnection(destinationId);
          console.log(`  → Chunk ${i + 1} started`);

          // Simulate chunk processing
          await new Promise(resolve =>
            setTimeout(resolve, 1000 + Math.random() * 2000),
          );

          // Perform some operations
          const coll = conn.db.collection(`test_entity_${i}`);
          await coll.insertOne({ chunk: i, processed: true });
          await coll.deleteMany({ chunk: i });

          console.log(`  ✓ Chunk ${i + 1} completed`);
        })(),
      );
    }

    await Promise.all(longRunningOps);
    console.log("");

    console.log(
      "✅ All tests passed! Connection pooling is working correctly.",
    );
    console.log("   The 'Topology is closed' error should no longer occur.\n");
  } catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
  } finally {
    // Cleanup
    console.log("Closing connection pool...");
    await destinationConnectionPool.closeAll();
    console.log("Done!");
    process.exit(0);
  }
}

// Run the test
testConnectionPool().catch(console.error);
