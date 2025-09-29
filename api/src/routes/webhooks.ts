import { Hono } from "hono";
import {
  SyncJob,
  WebhookEvent,
  Connector as DataSource,
} from "../database/workspace-schema";
import { inngest } from "../inngest/client";
import { v4 as uuidv4 } from "uuid";
import { connectorRegistry } from "../connectors/registry";

const router = new Hono();

/**
 * Webhook endpoint handler
 * URL structure: /api/webhooks/:workspaceId/:jobId
 */
router.post("/webhooks/:workspaceId/:jobId", async c => {
  const { workspaceId, jobId } = c.req.param();

  console.log("=== WEBHOOK DEBUG START ===");
  console.log("Workspace ID:", workspaceId);
  console.log("Job ID:", jobId);

  // For Stripe webhooks, we need the raw body as Buffer
  // Using arrayBuffer and converting to Buffer preserves the exact bytes
  const rawBodyBuffer = Buffer.from(await c.req.arrayBuffer());
  const rawBodyText = rawBodyBuffer.toString("utf8");
  const headers = c.req.header();

  console.log("Headers:", JSON.stringify(headers, null, 2));
  console.log("Raw body length:", rawBodyBuffer.length);
  console.log("Raw body (first 200 chars):", rawBodyText.substring(0, 200));

  try {
    // 1. Quick validation - find the sync job
    const syncJob = await SyncJob.findOne({
      _id: jobId,
      workspaceId: workspaceId,
      type: "webhook",
      enabled: true,
    });

    if (!syncJob) {
      console.warn(`Webhook received for invalid job: ${jobId}`);
      return c.json({ error: "Invalid webhook endpoint" }, 404);
    }

    if (!syncJob.webhookConfig?.enabled) {
      console.warn(`Webhook received for disabled job: ${jobId}`);
      return c.json({ error: "Webhook endpoint disabled" }, 403);
    }

    // 2. Get the data source and connector
    const dataSource = await DataSource.findById(syncJob.dataSourceId);
    if (!dataSource) {
      return c.json({ error: "Data source not found" }, 404);
    }

    // Get the connector for this data source type
    const connector = connectorRegistry.getConnector(dataSource);
    if (!connector) {
      return c.json(
        { error: `Connector not found for type: ${dataSource.type}` },
        500,
      );
    }

    // 3. Verify webhook signature using connector
    let event: any;

    if (connector.supportsWebhooks()) {
      console.log("Connector supports webhooks, verifying signature...");
      console.log("Webhook secret from DB:", syncJob.webhookConfig.secret);
      console.log(
        "Webhook secret length:",
        syncJob.webhookConfig.secret?.length,
      );
      console.log(
        "Secret starts with 'whsec_':",
        syncJob.webhookConfig.secret?.startsWith("whsec_"),
      );
      console.log(
        "First 10 chars of secret:",
        syncJob.webhookConfig.secret?.substring(0, 10),
      );

      const verificationResult = await connector.verifyWebhook({
        payload: rawBodyText,
        headers: headers,
        secret: syncJob.webhookConfig.secret,
      });

      if (!verificationResult.valid) {
        console.error(
          "Webhook signature verification failed:",
          verificationResult.error,
        );
        console.log("=== WEBHOOK DEBUG END (FAILED) ===");
        return c.json(
          { error: verificationResult.error || "Invalid signature" },
          400,
        );
      }

      console.log("Webhook signature verified successfully!");
      event = verificationResult.event;
    } else {
      // Connector doesn't support webhooks but we received one anyway
      // Parse the raw body as JSON
      try {
        event = JSON.parse(rawBodyText);
      } catch (e) {
        console.error("Invalid JSON payload", e);
        return c.json({ error: "Invalid JSON payload" }, 400);
      }
    }

    // 3. Store the raw event for processing
    const webhookEvent = new WebhookEvent({
      jobId,
      workspaceId,
      eventId: event.id || uuidv4(),
      eventType: event.type || event.event_type || event.action || "unknown",
      receivedAt: new Date(),
      status: "pending",
      attempts: 0,
      rawPayload: event,
      signature: JSON.stringify(headers), // Store all headers for audit/debugging
    });

    await webhookEvent.save();

    // 5. Update webhook stats
    await SyncJob.updateOne(
      { _id: jobId },
      {
        $set: { "webhookConfig.lastReceivedAt": new Date() },
        $inc: { "webhookConfig.totalReceived": 1 },
      },
    );

    // 6. Trigger immediate processing via Inngest
    await inngest.send({
      name: "webhook/event.process",
      data: {
        jobId,
        workspaceId,
        eventId: webhookEvent.eventId,
      },
    });

    // 8. Return success immediately
    console.log("Webhook processed successfully:", webhookEvent.eventId);
    console.log("=== WEBHOOK DEBUG END (SUCCESS) ===");
    return c.json({ received: true, eventId: webhookEvent.eventId }, 200);
  } catch (error) {
    console.error("Webhook handler error:", error);

    // Still return 200 to prevent retries for our errors
    return c.json(
      {
        received: false,
        error: "Internal processing error, event saved for retry",
      },
      200,
    );
  }
});

/**
 * Test webhook endpoint
 * Sends a test event to verify webhook configuration
 */
router.post("/webhooks/:workspaceId/:jobId/test", async c => {
  const { workspaceId, jobId } = c.req.param();

  try {
    const syncJob = await SyncJob.findOne({
      _id: jobId,
      workspaceId: workspaceId,
      type: "webhook",
    });

    if (!syncJob) {
      return c.json({ error: "Webhook job not found" });
    }

    // Create a test event
    const testEvent = {
      id: `test_${uuidv4()}`,
      type: "test.webhook",
      created: Math.floor(Date.now() / 1000),
      data: {
        message: "This is a test webhook event",
        timestamp: new Date().toISOString(),
      },
    };

    // Store the test event
    const webhookEvent = new WebhookEvent({
      jobId,
      workspaceId,
      eventId: testEvent.id,
      eventType: testEvent.type,
      receivedAt: new Date(),
      status: "pending",
      attempts: 0,
      rawPayload: testEvent,
    });

    await webhookEvent.save();

    // Trigger processing
    await inngest.send({
      name: "webhook/event.process",
      data: {
        jobId,
        workspaceId,
        eventId: webhookEvent.eventId,
        isTest: true,
      },
    });

    return c.json({
      success: true,
      message: "Test webhook sent successfully",
      eventId: testEvent.id,
    });
  } catch (error) {
    console.error("Test webhook error:", error);
    return c.json({ error: "Failed to send test webhook" }, 500);
  }
});

export { router as webhookRoutes };
