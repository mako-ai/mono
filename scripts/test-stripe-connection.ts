import * as dotenv from "dotenv";
import Stripe from "stripe";
import { dataSourceManager } from "../sync/data-source-manager";

dotenv.config();

async function testStripeConnection() {
  console.log("=== Testing Stripe Connection ===");

  // Get stripe_spain data source
  const stripeSpain = dataSourceManager.getDataSource("stripe_spain");

  if (!stripeSpain) {
    console.error("stripe_spain data source not found!");
    return;
  }

  if (!stripeSpain.connection.api_key) {
    console.error("No API key found for stripe_spain!");
    console.log("Make sure STRIPE_API_KEY_SPAIN is set in your .env file");
    return;
  }

  console.log(`Testing connection for: ${stripeSpain.name}`);
  console.log(
    `API key prefix: ${stripeSpain.connection.api_key.substring(0, 10)}...`,
  );

  try {
    // Create Stripe instance with timeout
    const stripe = new Stripe(stripeSpain.connection.api_key, {
      timeout: 30000, // 30 seconds
      maxNetworkRetries: 1,
    });

    console.log("\nAttempting to fetch a single subscription...");

    // Try to fetch just one subscription to test the connection
    const subscriptions = await stripe.subscriptions.list({
      limit: 1,
    });

    console.log(
      `✅ Success! Found ${subscriptions.data.length} subscription(s)`,
    );
    console.log(`Has more: ${subscriptions.has_more}`);

    if (subscriptions.data.length > 0) {
      console.log(`First subscription ID: ${subscriptions.data[0].id}`);
    }
  } catch (error) {
    console.error("\n❌ Failed to connect to Stripe:");

    if (error instanceof Stripe.errors.StripeError) {
      console.error(`Stripe Error Type: ${error.type}`);
      console.error(`Message: ${error.message}`);
      console.error(`Code: ${error.code}`);

      if (error.type === "StripeAuthenticationError") {
        console.error("\nAuthentication failed. This usually means:");
        console.error("1. The API key is invalid");
        console.error("2. The API key doesn't have the required permissions");
        console.error(
          "3. The API key is for the wrong environment (test vs live)",
        );
      }
    } else {
      console.error(`General error: ${error}`);
    }
  }
}

// Run the test
testStripeConnection().catch(console.error);
