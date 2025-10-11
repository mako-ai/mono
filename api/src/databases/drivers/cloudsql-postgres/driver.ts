import {
  DatabaseDriver,
  DatabaseDriverMetadata,
  DatabaseTreeNode,
} from "../../driver";
import { IDatabase } from "../../../database/workspace-schema";
import {
  Connector,
  AuthTypes,
  IpAddressTypes,
} from "@google-cloud/cloud-sql-connector";
import { Client as PgClient, Pool as PgPool } from "pg";
import { GoogleAuth, type AuthClient } from "google-auth-library";

interface QueryResult {
  success: boolean;
  data?: any;
  error?: string;
  rowCount?: number;
  fields?: any;
}

export class CloudSQLPostgresDatabaseDriver implements DatabaseDriver {
  private connectors: Map<string, Connector> = new Map();
  private pools: Map<string, PgPool> = new Map();

  getMetadata(): DatabaseDriverMetadata {
    return {
      type: "cloudsql-postgres",
      displayName: "Cloud SQL (Postgres)",
      consoleLanguage: "sql",
    } as any;
  }

  async getTreeRoot(database: IDatabase): Promise<DatabaseTreeNode[]> {
    const result = await this.executeQuery(
      database,
      `select schema_name from information_schema.schemata order by schema_name;`,
    );
    if (!result.success) return [];
    const systemSchemas: Record<string, true> = {
      information_schema: true,
      pg_catalog: true,
      pg_toast: true,
      pg_temp_1: true,
      pg_toast_temp_1: true,
      public: true,
    };
    const rows: Array<{ schema_name: string }> = result.data || [];
    return rows
      .map(r => r.schema_name)
      .filter(s => !systemSchemas[s])
      .sort((a, b) => a.localeCompare(b))
      .map<DatabaseTreeNode>(schema => ({
        id: schema,
        label: schema,
        kind: "schema",
        hasChildren: true,
        metadata: { schema },
      }));
  }

  async getChildren(
    database: IDatabase,
    parent: { kind: string; id: string; metadata?: any },
  ): Promise<DatabaseTreeNode[]> {
    if (parent.kind !== "schema") return [];
    const schema = parent.metadata?.schema || parent.id;
    const safeSchema = String(schema).replace(/'/g, "''");
    const result = await this.executeQuery(
      database,
      `select table_name, table_type from information_schema.tables where table_schema = '${safeSchema}' order by table_name;`,
    );
    if (!result.success) return [];
    const rows: Array<{ table_name: string; table_type: string }> =
      result.data || [];
    return rows.map<DatabaseTreeNode>(r => ({
      id: `${schema}.${r.table_name}`,
      label: r.table_name,
      kind: r.table_type === "VIEW" ? "view" : "table",
      hasChildren: false,
      metadata: { schema, table: r.table_name },
    }));
  }

  async executeQuery(
    database: IDatabase,
    query: string,
    _options?: any,
  ): Promise<QueryResult> {
    try {
      const pool = await this.getConnection(database);
      const result = await pool.query(query);
      return {
        success: true,
        data: result.rows,
        rowCount: result.rowCount ?? undefined,
        fields: result.fields,
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Cloud SQL PostgreSQL query failed",
      };
    }
  }

  async testConnection(
    database: IDatabase,
  ): Promise<{ success: boolean; error?: string }> {
    let connector: Connector | null = null;
    let client: PgClient | null = null;
    try {
      const conn = (database.connection as any) || {};
      connector = await this._getConnector(database);

      const getOpts: any = {};
      if (conn.instanceConnectionName || conn.instance_connection_name) {
        getOpts.instanceConnectionName =
          conn.instanceConnectionName || conn.instance_connection_name;
      }
      if (conn.domainName || conn.domain_name) {
        getOpts.domainName = conn.domainName || conn.domain_name;
      }
      const requestedIpType =
        typeof conn.ipType === "string" ? conn.ipType.toUpperCase() : undefined;
      const resolvedIpType =
        requestedIpType && requestedIpType in IpAddressTypes
          ? IpAddressTypes[
              requestedIpType as keyof typeof IpAddressTypes
            ]
          : undefined;
      if (resolvedIpType) {
        getOpts.ipType = resolvedIpType;
      }

      const requestedAuthType =
        typeof conn.authType === "string"
          ? conn.authType.toUpperCase()
          : undefined;
      const resolvedAuthType =
        requestedAuthType && requestedAuthType in AuthTypes
          ? AuthTypes[
              requestedAuthType as keyof typeof AuthTypes
            ]
          : undefined;
      if (resolvedAuthType) {
        getOpts.authType = resolvedAuthType;
      }

      console.log("[CloudSQL] Calling connector.getOptions with:", getOpts);

      let clientOpts;
      try {
        clientOpts = await connector.getOptions(getOpts);
        console.log("[CloudSQL] Successfully got client options");
      } catch (getOptionsError) {
        console.error("[CloudSQL] Failed to get options:", getOptionsError);
        // More detailed error handling
        if (
          getOptionsError instanceof Error &&
          getOptionsError.message.includes("Login Required")
        ) {
          throw new Error(
            "Authentication failed. The service account credentials may not have the required permissions. " +
              "Please ensure the service account has 'Cloud SQL Client' role in the project.",
          );
        }
        throw getOptionsError;
      }

      let user: string | undefined = conn.username;
      if (resolvedAuthType === AuthTypes.IAM) {
        if (!user && conn.service_account_json) {
          try {
            const sa =
              typeof conn.service_account_json === "string"
                ? JSON.parse(conn.service_account_json)
                : conn.service_account_json;
            const email = sa?.client_email;
            if (email) {
              if (email.endsWith(".gserviceaccount.com")) {
                const [localPart] = email.split("@");
                const projectId =
                  sa.project_id || email.split("@")[1].split(".")[0];
                user = `${localPart}@${projectId}.iam`;
                console.log(
                  "[CloudSQL] Using IAM format for connection test:",
                  user,
                );
              } else {
                user = email;
              }
            }
          } catch (e) {
            console.error(
              "[CloudSQL] Failed to extract email from service account:",
              e,
            );
          }
        }
      }

      client = new PgClient({
        ...(clientOpts as any),
        user,
        database: conn.database,
        password: resolvedAuthType === AuthTypes.IAM ? "" : conn.password,
      });

      await client.connect();
      await client.query("SELECT 1");
      return { success: true };
    } catch (error) {
      console.error("[CloudSQL] Connection test failed:", error);
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Cloud SQL PostgreSQL connection failed",
      };
    } finally {
      if (client) {
        try {
          await client.end();
        } catch (e) {
          console.error("[CloudSQL] Error closing test client:", e);
        }
      }
      if (connector) {
        try {
          await connector.close();
        } catch (e) {
          console.error("[CloudSQL] Error closing test connector:", e);
        }
      }
    }
  }

  async getConnection(database: IDatabase): Promise<PgPool> {
    const key = database._id.toString();
    const existingPool = this.pools.get(key);
    if (existingPool) {
      return existingPool;
    }

    try {
      const conn = (database.connection as any) || {};
      const connector = await this._getConnector(database);

      const getOpts: any = {};
      if (conn.instanceConnectionName || conn.instance_connection_name) {
        getOpts.instanceConnectionName =
          conn.instanceConnectionName || conn.instance_connection_name;
      }
      if (conn.domainName || conn.domain_name) {
        getOpts.domainName = conn.domainName || conn.domain_name;
      }
      const requestedIpType =
        typeof conn.ipType === "string" ? conn.ipType.toUpperCase() : undefined;
      const resolvedIpType =
        requestedIpType && requestedIpType in IpAddressTypes
          ? IpAddressTypes[
              requestedIpType as keyof typeof IpAddressTypes
            ]
          : undefined;
      if (resolvedIpType) {
        getOpts.ipType = resolvedIpType;
      }

      const requestedAuthType =
        typeof conn.authType === "string"
          ? conn.authType.toUpperCase()
          : undefined;
      const resolvedAuthType =
        requestedAuthType && requestedAuthType in AuthTypes
          ? AuthTypes[
              requestedAuthType as keyof typeof AuthTypes
            ]
          : undefined;
      if (resolvedAuthType) {
        getOpts.authType = resolvedAuthType;
      }

      const clientOpts = await connector.getOptions(getOpts);

      let user: string | undefined = conn.username;
      if (resolvedAuthType === AuthTypes.IAM) {
        if (!user && conn.service_account_json) {
          // Try to extract email from service account JSON
          try {
            const sa =
              typeof conn.service_account_json === "string"
                ? JSON.parse(conn.service_account_json)
                : conn.service_account_json;
            const email = sa?.client_email;
            if (email) {
              // For IAM auth, if the email ends with gserviceaccount.com,
              // convert to the IAM format: name@project.iam
              if (email.endsWith(".gserviceaccount.com")) {
                const [localPart] = email.split("@");
                const projectId =
                  sa.project_id || email.split("@")[1].split(".")[0];
                user = `${localPart}@${projectId}.iam`;
                console.log(
                  "[CloudSQL] Converted service account email to IAM format:",
                  user,
                );
              } else {
                user = email;
              }
            }
          } catch (e) {
            console.error(
              "[CloudSQL] Failed to extract email from service account for pool:",
              e,
            );
          }
        }

        if (!user) {
          console.warn(
            "[CloudSQL] IAM auth selected but no username provided for pool. " +
              "Please provide username in format: service-account@project.iam",
          );
        }
      }

      const pool = new PgPool({
        ...(clientOpts as any),
        user,
        database: conn.database,
        password: resolvedAuthType === AuthTypes.IAM ? "" : conn.password, // Empty password for IAM auth
        max: 5,
      });

      this.connectors.set(key, connector);
      this.pools.set(key, pool); // Store pool reference for cleanup
      return pool;
    } catch (error) {
      console.error("[CloudSQL] Failed to create connection pool:", error);
      throw new Error(
        `Failed to establish Cloud SQL connection: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    }
  }

  async closeConnection(databaseId: string): Promise<void> {
    const pool = this.pools.get(databaseId);
    if (pool) {
      await pool.end();
      this.pools.delete(databaseId);
    }
    const connector = this.connectors.get(databaseId);
    if (connector) {
      await connector.close();
      this.connectors.delete(databaseId);
    }
  }

  async closeAllConnections(): Promise<void> {
    for (const id of this.pools.keys()) {
      await this.closeConnection(id);
    }
  }

  private async _getConnector(database: IDatabase): Promise<Connector> {
    const conn = (database.connection as any) || {};

    // Debug logging to trace connection config
    console.log("[CloudSQL] Getting connector with config:", {
      instanceConnectionName: conn.instanceConnectionName,
      domainName: conn.domainName,
      authType: conn.authType,
      hasServiceAccount: !!conn.service_account_json,
      username: conn.username,
      database: conn.database,
      ipType: conn.ipType,
    });

    // Set up authentication
    let auth: GoogleAuth | undefined;

    // Check if service account JSON is provided (multi-tenant scenario)
    if (conn.service_account_json) {
      try {
        const credentials =
          typeof conn.service_account_json === "string"
            ? JSON.parse(conn.service_account_json)
            : conn.service_account_json;

        console.log("[CloudSQL] Using provided service account:", {
          type: credentials.type,
          client_email: credentials.client_email,
          project_id: credentials.project_id,
          hasPrivateKey: !!credentials.private_key,
        });

        auth = new GoogleAuth({
          credentials,
          scopes: [
            "https://www.googleapis.com/auth/cloud-platform",
            "https://www.googleapis.com/auth/sqlservice.admin",
            "https://www.googleapis.com/auth/sqlservice.login",
          ],
          projectId: credentials.project_id,
        });

        // Test if auth is working by trying to get an access token
        console.log("[CloudSQL] Testing auth by getting access token...");
        let authClient: AuthClient | null = null;
        try {
          authClient = await auth.getClient();
          console.log("[CloudSQL] Auth client obtained successfully");
          const accessToken = await authClient.getAccessToken();
          console.log("[CloudSQL] Access token obtained, auth is working");
        } catch (authTestError) {
          console.error("[CloudSQL] Auth test failed:", authTestError);
          throw new Error(
            `Service account authentication failed: ${authTestError instanceof Error ? authTestError.message : "Unknown error"}`,
          );
        }

        if (!authClient) {
          throw new Error(
            "Auth client initialization failed even though credentials were parsed successfully.",
          );
        }
        console.log("[CloudSQL] Using GoogleAuth instance for connector");
        const connector = new Connector({ auth });
        console.log("[CloudSQL] Connector created successfully");
        return connector;
      } catch (parseError) {
        console.error(
          "[CloudSQL] Failed to parse service account JSON:",
          parseError,
        );
        throw new Error(
          `Invalid service account JSON: ${
            parseError instanceof Error ? parseError.message : "Parse error"
          }`,
        );
      }
    } else {
      // Fall back to Application Default Credentials
      console.log(
        "[CloudSQL] No service account JSON provided, using Application Default Credentials",
      );
      try {
        auth = new GoogleAuth({
          scopes: [
            "https://www.googleapis.com/auth/cloud-platform",
            "https://www.googleapis.com/auth/sqlservice.admin",
            "https://www.googleapis.com/auth/sqlservice.login",
          ],
        });
        const authClient = await auth.getClient();
        console.log("[CloudSQL] ADC credentials validated");
        return new Connector({ auth });
      } catch (authError) {
        console.error("[CloudSQL] Failed to create auth with ADC:", authError);
        throw new Error(
          `Authentication setup failed: ${
            authError instanceof Error ? authError.message : "Unknown error"
          }. ` +
            `Please provide service account JSON or ensure GOOGLE_APPLICATION_CREDENTIALS is set.`,
        );
      }
    }
  }
}
