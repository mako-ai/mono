import { IDatabase } from "../database/workspace-schema";

export interface DatabaseTreeNode {
  id: string;
  label: string;
  kind: string;
  hasChildren?: boolean;
  icon?: string; // optional icon key or inline svg name
  metadata?: any;
}

export interface DatabaseDriverMetadata {
  type: string;
  displayName: string;
  consoleLanguage: "sql" | "mongodb" | "javascript" | string;
  icon?: string;
}

export interface DatabaseDriver {
  getMetadata(): DatabaseDriverMetadata;
  getTreeRoot(database: IDatabase): Promise<DatabaseTreeNode[]>;
  getChildren(
    database: IDatabase,
    parent: { kind: string; id: string; metadata?: any },
  ): Promise<DatabaseTreeNode[]>;
  executeQuery(
    database: IDatabase,
    query: string,
    options?: any,
  ): Promise<{
    success: boolean;
    data?: any;
    error?: string;
    rowCount?: number;
  }>;
}
