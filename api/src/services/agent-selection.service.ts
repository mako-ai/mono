import { AgentKind } from "../agent/types";
import { ConsoleData } from "../agent/shared/console-tools";

interface SelectionContext {
  sessionActiveAgent?: AgentKind;
  userMessage: string;
  consoles?: ConsoleData[];
  workspaceHasBigQuery?: boolean;
  workspaceHasMongoDB?: boolean;
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

  // Priority 4: Check workspace capabilities
  // If workspace only has one type of database, prefer that
  if (context.workspaceHasMongoDB && !context.workspaceHasBigQuery) {
    return "mongo";
  }
  if (context.workspaceHasBigQuery && !context.workspaceHasMongoDB) {
    return "bigquery";
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
    "sql",
    "select",
    "from",
    "where",
    "join",
    "table",
    "dataset",
    "schema",
    "column",
    "row",
    "query",
    "struct",
    "array",
    "partition",
    "cluster",
  ];

  // More strict matching for SQL keywords to avoid false positives
  const sqlPattern =
    /\b(select|insert|update|delete|create)\s+(from|into|table|or)/i;

  return (
    bigQueryKeywords.some(keyword => message.includes(keyword)) ||
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

  // Low confidence - defaulting to triage
  return {
    agent: selectedAgent,
    confidence: "low",
    reason: "No clear indicators, using triage",
  };
};
