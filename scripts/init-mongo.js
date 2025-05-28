// MongoDB initialization script
db = db.getSiblingDB("multi_tenant_analytics");
db.createCollection("data_sources");

print("MongoDB initialized with multi_tenant_analytics database");
