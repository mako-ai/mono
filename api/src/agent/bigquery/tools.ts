// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore – provided at runtime
import { tool } from "@openai/agents";
import { Types } from "mongoose";
import { Database } from "../../database/workspace-schema";
import { databaseConnectionService } from "../../services/database-connection.service";
import {
  createConsoleTools,
  SendEventFunction,
  ConsoleData,
} from "../shared/console-tools";

const listDatasets = async (databaseId: string, workspaceId: string) => {
  if (
    !Types.ObjectId.isValid(databaseId) ||
    !Types.ObjectId.isValid(workspaceId)
  ) {
    throw new Error("Invalid database ID or workspace ID");
  }
  const database = await Database.findOne({
    _id: new Types.ObjectId(databaseId),
    workspaceId: new Types.ObjectId(workspaceId),
  });
  if (!database) {
    throw new Error("Database not found or access denied");
  }
  if (database.type !== "bigquery") {
    throw new Error("list_datasets only supports BigQuery databases");
  }
  const datasets = await databaseConnectionService.listBigQueryDatasets(
    database as any,
  );
  return datasets.map(ds => ({ datasetId: ds }));
};

const listTables = async (
  databaseId: string,
  datasetId: string,
  workspaceId: string,
) => {
  if (
    !Types.ObjectId.isValid(databaseId) ||
    !Types.ObjectId.isValid(workspaceId)
  ) {
    throw new Error("Invalid database ID or workspace ID");
  }
  const database = await Database.findOne({
    _id: new Types.ObjectId(databaseId),
    workspaceId: new Types.ObjectId(workspaceId),
  });
  if (!database) {
    throw new Error("Database not found or access denied");
  }
  if (database.type !== "bigquery") {
    throw new Error("list_tables only supports BigQuery databases");
  }
  const items = await databaseConnectionService.listBigQueryTables(
    database as any,
    datasetId,
  );
  return items.map(it => ({ name: it.name, type: it.type }));
};

const buildInspectTableSql = (
  projectId: string,
  datasetId: string,
  tableId: string,
) =>
  "SELECT column_name, data_type, is_nullable, ordinal_position\n" +
  `FROM \`${projectId}.${datasetId}.INFORMATION_SCHEMA.COLUMNS\`\n` +
  `WHERE table_name = '${tableId}'\n` +
  "ORDER BY ordinal_position\n" +
  "LIMIT 1000";

const inspectTable = async (
  databaseId: string,
  datasetId: string,
  tableId: string,
  workspaceId: string,
) => {
  if (
    !Types.ObjectId.isValid(databaseId) ||
    !Types.ObjectId.isValid(workspaceId)
  ) {
    throw new Error("Invalid database ID or workspace ID");
  }
  const database = await Database.findOne({
    _id: new Types.ObjectId(databaseId),
    workspaceId: new Types.ObjectId(workspaceId),
  });
  if (!database) {
    throw new Error("Database not found or access denied");
  }
  if (database.type !== "bigquery") {
    throw new Error("inspect_table only supports BigQuery databases");
  }
  const projectId = (database as any).connection?.project_id;
  if (!projectId) throw new Error("BigQuery connection missing project_id");
  const sql = buildInspectTableSql(projectId, datasetId, tableId);
  const res = await databaseConnectionService.executeQuery(
    database as any,
    sql,
  );
  if (!res.success) throw new Error(res.error || "Failed to inspect table");
  return { columns: res.data };
};

const appendLimitIfMissing = (sql: string): string => {
  const hasLimit = /\blimit\s+\d+\b/i.test(sql);
  if (hasLimit) return sql;
  const trimmed = sql.replace(/;\s*$/i, "");
  return `${trimmed}\nLIMIT 500;`;
};

const executeBigQuerySql = async (
  databaseId: string,
  query: string,
  workspaceId: string,
) => {
  if (
    !Types.ObjectId.isValid(databaseId) ||
    !Types.ObjectId.isValid(workspaceId)
  ) {
    throw new Error("Invalid database ID or workspace ID");
  }
  const database = await Database.findOne({
    _id: new Types.ObjectId(databaseId),
    workspaceId: new Types.ObjectId(workspaceId),
  });
  if (!database) {
    throw new Error("Database not found or access denied");
  }
  if (database.type !== "bigquery") {
    throw new Error(
      "execute_query only supports BigQuery databases in this tool",
    );
  }
  const safeQuery = appendLimitIfMissing(query);
  const res = await databaseConnectionService.executeQuery(
    database as any,
    safeQuery,
  );
  return res;
};

export const createBigQueryTools = (
  workspaceId: string,
  sendEvent?: SendEventFunction,
  consoles?: ConsoleData[],
) => {
  const listDatasetsTool = tool({
    name: "bq_list_datasets",
    description: "List BigQuery datasets for the provided database identifier.",
    parameters: {
      type: "object",
      properties: { databaseId: { type: "string" } },
      required: ["databaseId"],
      additionalProperties: false,
    },
    execute: async (input: any) => listDatasets(input.databaseId, workspaceId),
  });

  const listTablesTool = tool({
    name: "bq_list_tables",
    description: "List BigQuery tables for a given dataset.",
    parameters: {
      type: "object",
      properties: {
        databaseId: { type: "string" },
        datasetId: { type: "string" },
      },
      required: ["databaseId", "datasetId"],
      additionalProperties: false,
    },
    execute: async (input: any) =>
      listTables(input.databaseId, input.datasetId, workspaceId),
  });

  const inspectTableTool = tool({
    name: "bq_inspect_table",
    description:
      "Return columns with data types and nullability for a given table via INFORMATION_SCHEMA.",
    parameters: {
      type: "object",
      properties: {
        databaseId: { type: "string" },
        datasetId: { type: "string" },
        tableId: { type: "string" },
      },
      required: ["databaseId", "datasetId", "tableId"],
      additionalProperties: false,
    },
    execute: async (input: any) =>
      inspectTable(
        input.databaseId,
        input.datasetId,
        input.tableId,
        workspaceId,
      ),
  });

  const executeSqlTool = tool({
    name: "bq_execute_query",
    description:
      "Execute a BigQuery SQL query and return the results (LIMIT 500 enforced by default).",
    parameters: {
      type: "object",
      properties: { databaseId: { type: "string" }, query: { type: "string" } },
      required: ["databaseId", "query"],
      additionalProperties: false,
    },
    execute: async (input: any) =>
      executeBigQuerySql(input.databaseId, input.query, workspaceId),
  });

  const consoleTools = createConsoleTools(sendEvent, consoles);

  return [
    listDatasetsTool,
    listTablesTool,
    inspectTableTool,
    executeSqlTool,
    ...consoleTools,
  ];
};
