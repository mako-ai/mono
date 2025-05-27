// MongoDB initialization script
db = db.getSiblingDB("close_analytics");

// Create collections with indexes for better query performance
db.createCollection("leads");
db.createCollection("leads_staging");

// Create indexes for leads collection
db.leads.createIndex({ id: 1 }, { unique: true });
db.leads.createIndex({ status_id: 1 });
db.leads.createIndex({ user_id: 1 });
db.leads.createIndex({ date_created: 1 });
db.leads.createIndex({ date_updated: 1 });

// Create the same indexes for staging collection
db.leads_staging.createIndex({ id: 1 }, { unique: true });
db.leads_staging.createIndex({ status_id: 1 });
db.leads_staging.createIndex({ user_id: 1 });
db.leads_staging.createIndex({ date_created: 1 });
db.leads_staging.createIndex({ date_updated: 1 });

print("MongoDB initialized with close_analytics database and collections");
