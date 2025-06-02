// MongoDB initialization script
db = db.getSiblingDB("multi_tenant_analytics");

// Create the database if it doesn't exist
db.createCollection("_init");

// Log initialization
print("MongoDB initialized with multi_tenant_analytics database");
