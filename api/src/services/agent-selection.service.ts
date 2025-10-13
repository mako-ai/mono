import { AgentKind } from "../agent/types";
import { ConsoleData } from "../agent/shared/console-tools";

interface SelectionContext {
  sessionActiveAgent?: AgentKind;
  userMessage: string;
  consoles?: ConsoleData[];
  workspaceHasBigQuery?: boolean;
  workspaceHasMongoDB?: boolean;
  workspaceHasPostgres?: boolean;
}

/**
 * Smart agent selection based on context
 * Returns the most appropriate agent to handle the request
 */
export const selectInitialAgent = (context: SelectionContext): AgentKind => {
  // Priority 1: If session already has an active agent, use it
  if (context.sessionActiveAgent) {
    return context.sessionActiveAgent;
  }

  // Priority 2: Check attached console context
  if (context.consoles && context.consoles.length > 0) {
    const consoleContent = context.consoles
      .map(c => c.content || "")
      .join(" ")
      .toLowerCase();

    // Look for database-specific patterns in console content
    if (containsMongoPatterns(consoleContent)) {
      return "mongo";
    }
    if (containsBigQueryPatterns(consoleContent)) {
      return "bigquery";
    }
    if (containsPostgresPatterns(consoleContent)) {
      return "postgres";
    }
  }

  // Priority 3: Analyze user message for database-specific keywords
  const messageLower = context.userMessage.toLowerCase();

  // MongoDB keywords
  if (containsMongoKeywords(messageLower)) {
    return "mongo";
  }

  // BigQuery keywords
  if (containsBigQueryKeywords(messageLower)) {
    return "bigquery";
  }

  // Postgres keywords
  if (containsPostgresKeywords(messageLower)) {
    return "postgres";
  }

  // Priority 4: Check workspace capabilities
  // If workspace only has one type of database, prefer that
  if (context.workspaceHasMongoDB && !context.workspaceHasBigQuery) {
    return "mongo";
  }
  if (context.workspaceHasBigQuery && !context.workspaceHasMongoDB) {
    return "bigquery";
  }
  if (
    context.workspaceHasPostgres &&
    !context.workspaceHasMongoDB &&
    !context.workspaceHasBigQuery
  ) {
    return "postgres";
  }

  // Default: Use triage agent for ambiguous cases
  return "triage";
};

/**
 * Check if content contains MongoDB-specific patterns
 */
function containsMongoPatterns(content: string): boolean {
  const mongoPatterns = [
    /db\.\w+\.(find|aggregate|insert|update|delete)/,
    /\$match\s*:/,
    /\$group\s*:/,
    /\$project\s*:/,
    /\$lookup\s*:/,
    /\$unwind\s*:/,
    /\$sort\s*:/,
    /\.aggregate\s*\(/,
    /\.find\s*\(/,
    /\.findOne\s*\(/,
    /\.insertOne\s*\(/,
    /\.updateOne\s*\(/,
    /\.deleteOne\s*\(/,
    /\.collection\s*\(/,
    /mongodb:/,
  ];

  return mongoPatterns.some(pattern => pattern.test(content));
}

/**
 * Check if content contains BigQuery-specific patterns
 */
function containsBigQueryPatterns(content: string): boolean {
  const bigQueryPatterns = [
    /select\s+.+\s+from\s+/i,
    /insert\s+into\s+/i,
    /update\s+.+\s+set\s+/i,
    /delete\s+from\s+/i,
    /create\s+table\s+/i,
    /create\s+or\s+replace\s+table\s+/i,
    /with\s+.+\s+as\s*\(/i,
    /group\s+by\s+/i,
    /order\s+by\s+/i,
    /partition\s+by\s+/i,
    /format_timestamp/i,
    /date_trunc/i,
    /extract\s*\(/i,
    /unnest\s*\(/i,
    /array_agg\s*\(/i,
    /struct\s*\(/i,
    /bigquery/i,
  ];

  return bigQueryPatterns.some(pattern => pattern.test(content));
}

/**
 * Check if content contains Postgres-specific patterns
 */
function containsPostgresPatterns(content: string): boolean {
  const postgresPatterns = [
    /\bselect\s+.+\s+from\s+.+\b/i,
    /\bjoin\b/i,
    /\border\s+by\b/i,
    /\bgroup\s+by\b/i,
    /\bwindow\b/i,
    /\bover\s*\(/i,
    /\bcommon_table_expression\b/i,
    /\bwith\s+.+\s+as\s*\(/i,
    /\bpostgres\b/i,
    /\bpostgresql\b/i,
    /\bjsonb?\b/i,
    /\b::[a-z_]+\b/i,
    /\binterval\b/i,
  ];

  return postgresPatterns.some(pattern => pattern.test(content));
}

/**
 * Check if message contains MongoDB-related keywords
 */
function containsMongoKeywords(message: string): boolean {
  const mongoKeywords = [
    "mongo",
    "mongodb",
    "collection",
    "document",
    "aggregate",
    "pipeline",
    "lookup",
    "unwind",
    "match",
    "group",
    "project",
    "bson",
    "objectid",
    "_id",
  ];

  return mongoKeywords.some(
    keyword => message.includes(keyword) || message.includes(`$${keyword}`),
  );
}

/**
 * Check if message contains BigQuery-related keywords
 */
function containsBigQueryKeywords(message: string): boolean {
  const bigQueryKeywords = [
    "bigquery",
    "bq",
    "dataset",
    "struct",
    "array",
    "partition",
    "cluster",
    "gcp",
    "project",
    "lookml",
  ];

  const sqlPattern =
    /\b(select|insert|update|delete|create)\s+(from|into|table|or)/i;

  const hasBigQueryKeyword = bigQueryKeywords.some(keyword =>
    message.includes(keyword),
  );

  if (hasBigQueryKeyword) {
    return true;
  }

  // Require both generic SQL pattern and a BigQuery-specific term to avoid collisions
  const bigQuerySpecificPatterns = [
    /\bunnest\b/i,
    /\barray_agg\b/i,
    /\bsafe_offset\b/i,
    /\bsafe_cast\b/i,
  ];

  return (
    sqlPattern.test(message) &&
    bigQuerySpecificPatterns.some(pattern => pattern.test(message))
  );
}

/**
 * Check if message contains Postgres-related keywords
 */
function containsPostgresKeywords(message: string): boolean {
  const postgresKeywords = [
    "postgres",
    "postgresql",
    "psql",
    "relational",
    "schema",
    "table",
    "column",
    "join",
    "cte",
    "window function",
    "primary key",
    "foreign key",
  ];

  const sqlPattern =
    /\b(select|insert|update|delete|create|alter)\s+(from|into|table|index)/i;

  return (
    postgresKeywords.some(keyword => message.includes(keyword)) ||
    sqlPattern.test(message)
  );
}

/**
 * Analyze confidence level of the selection
 * Useful for logging and debugging
 */
export const getSelectionConfidence = (
  context: SelectionContext,
  selectedAgent: AgentKind,
): {
  agent: AgentKind;
  confidence: "high" | "medium" | "low";
  reason: string;
} => {
  // High confidence cases
  if (context.sessionActiveAgent === selectedAgent) {
    return {
      agent: selectedAgent,
      confidence: "high",
      reason: "Using existing session agent",
    };
  }

  if (context.consoles && context.consoles.length > 0) {
    const consoleContent = context.consoles
      .map(c => c.content || "")
      .join(" ")
      .toLowerCase();

    if (selectedAgent === "mongo" && containsMongoPatterns(consoleContent)) {
      return {
        agent: selectedAgent,
        confidence: "high",
        reason: "MongoDB patterns detected in console",
      };
    }

    if (
      selectedAgent === "bigquery" &&
      containsBigQueryPatterns(consoleContent)
    ) {
      return {
        agent: selectedAgent,
        confidence: "high",
        reason: "BigQuery patterns detected in console",
      };
    }

    if (
      selectedAgent === "postgres" &&
      containsPostgresPatterns(consoleContent)
    ) {
      return {
        agent: selectedAgent,
        confidence: "high",
        reason: "Postgres patterns detected in console",
      };
    }
  }

  // Medium confidence cases
  const messageLower = context.userMessage.toLowerCase();
  if (selectedAgent === "mongo" && containsMongoKeywords(messageLower)) {
    return {
      agent: selectedAgent,
      confidence: "medium",
      reason: "MongoDB keywords in message",
    };
  }

  if (selectedAgent === "bigquery" && containsBigQueryKeywords(messageLower)) {
    return {
      agent: selectedAgent,
      confidence: "medium",
      reason: "BigQuery keywords in message",
    };
  }

  if (selectedAgent === "postgres" && containsPostgresKeywords(messageLower)) {
    return {
      agent: selectedAgent,
      confidence: "medium",
      reason: "Postgres keywords in message",
    };
  }

  // Low confidence - defaulting to triage
  return {
    agent: selectedAgent,
    confidence: "low",
    reason: "No clear indicators, using triage",
  };
};
