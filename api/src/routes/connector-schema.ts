import { Hono } from "hono";
import { connectorRegistry } from "../connectors/registry";

export const connectorSchemaRoutes = new Hono();

// GET /api/connectors/:type/schema - returns JSON schema for connector config fields
connectorSchemaRoutes.get("/:type/schema", async c => {
  const type = c.req.param("type");
  if (!type) {
    return c.json({ success: false, error: "Connector type is required" }, 400);
  }

  const metadata = connectorRegistry.getMetadata(type);
  if (!metadata) {
    return c.json({ success: false, error: "Connector not found" }, 404);
  }

  // Expect connector class to expose static getConfigSchema()
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const schema = metadata.connector.getConfigSchema?.();
  if (!schema) {
    return c.json(
      { success: false, error: "Schema not defined for connector" },
      404,
    );
  }

  return c.json({ success: true, data: schema });
});
