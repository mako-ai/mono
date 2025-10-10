import {
  Connector,
  IpAddressTypes,
  AuthTypes,
} from "@google-cloud/cloud-sql-connector";
import { Client } from "pg";
import { GoogleAuth } from "google-auth-library";
import * as path from "path";
import * as fs from "fs";

async function main() {
  console.log("Starting Cloud SQL connection test with IAM authentication...");

  // Load the service account credentials as a string
  const serviceAccountPath = path.join(
    __dirname,
    "realadvisor-prod-cc471f766108.json",
  );
  const serviceAccountKeyString = fs.readFileSync(serviceAccountPath, "utf8");
  const serviceAccount = JSON.parse(serviceAccountKeyString);
  const serviceAccountEmail = serviceAccount.client_email;

  // For IAM auth, the username should be the service account email without domain
  const iamUser = serviceAccountEmail.split("@")[0];

  // Create GoogleAuth instance with credentials
  const auth = new GoogleAuth({
    credentials: serviceAccount,
    scopes: [
      "https://www.googleapis.com/auth/cloud-platform",
      "https://www.googleapis.com/auth/sqlservice.admin",
    ],
  });

  // Create a new connector instance with the auth client
  const connector = new Connector({
    auth: auth,
  });

  try {
    // Get the client configuration for connecting to the Cloud SQL instance
    // Using IAM authentication type
    const clientOpts = await connector.getOptions({
      instanceConnectionName: "realadvisor-prod:europe-west1:dbi-main",
      ipType: IpAddressTypes.PUBLIC,
      authType: AuthTypes.IAM,
    });

    // Use the IAM user name as created by gcloud
    const client = new Client({
      ...clientOpts,
      user: "mako-revops@realadvisor-prod.iam", // IAM user name as shown in gcloud
      password: "", // Empty password for IAM authentication
      database: "realadvisor",
    });

    console.log("Connecting to Cloud SQL instance...");
    console.log(`Instance: realadvisor-prod:europe-west1:dbi-main`);
    console.log(`Database: realadvisor`);
    console.log(`Database User: mako-revops@realadvisor-prod.iam`);
    console.log(`Service Account: ${serviceAccountEmail}`);
    console.log(`Auth Type: IAM`);

    // Connect to the database
    await client.connect();
    console.log("Successfully connected to the database!");

    // Execute a simple query
    console.log("Executing test query: SELECT * FROM leads LIMIT 1;");
    const result = await client.query("SELECT * FROM leads LIMIT 1;");

    console.log("Query result:", JSON.stringify(result, null, 2));
    console.log("Connection test successful!");

    // Close the connection
    await client.end();
    console.log("Database connection closed.");
  } catch (error: any) {
    console.error("\n❌ Error connecting to Cloud SQL:");

    if (error.code === "28P01") {
      console.error(
        "IAM authentication failed. Please ensure:\n" +
          "1. IAM authentication is enabled on the Cloud SQL instance (cloudsql.iam_authentication=on)\n" +
          "2. The service account has the 'Cloud SQL Client' role\n" +
          "3. The IAM database user exists in PostgreSQL",
      );
      console.error(`\nTo create the IAM database user, you can use gcloud:`);
      console.error(
        `gcloud sql users create ${serviceAccountEmail} --instance=dbi-main --type=cloud_iam_service_account`,
      );
      console.error(`\nOr create it manually with SQL (try both formats):`);
      console.error(`CREATE USER "${serviceAccountEmail}" WITH LOGIN;`);
      console.error(
        `GRANT ALL PRIVILEGES ON DATABASE realadvisor TO "${serviceAccountEmail}";`,
      );
      console.error(`\n-- OR with just the username part:`);
      console.error(`CREATE USER "${iamUser}" WITH LOGIN;`);
      console.error(
        `GRANT ALL PRIVILEGES ON DATABASE realadvisor TO "${iamUser}";`,
      );
    } else if (error.code === "ENOTFOUND") {
      console.error(
        "Could not reach Cloud SQL instance. Check your connection name and network.",
      );
    } else if (error.message && error.message.includes("SASL")) {
      console.error(
        "SASL authentication error. This typically means:\n" +
          "- IAM authentication is not enabled on the Cloud SQL instance\n" +
          "- The instance is still expecting password authentication\n" +
          "\nTo enable IAM authentication on your instance:",
      );
      console.error(
        `gcloud sql instances patch dbi-main --database-flags cloudsql.iam_authentication=on`,
      );
    } else {
      console.error(error.message);
    }

    throw error;
  } finally {
    // Close the connector
    await connector.close();
    console.log("Connector closed.");
  }
}

// Run the main function
main().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});
