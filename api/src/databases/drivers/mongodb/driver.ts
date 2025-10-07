import {
  DatabaseDriver,
  DatabaseDriverMetadata,
  DatabaseTreeNode,
} from "../../driver";
import { IDatabase } from "../../../database/workspace-schema";
import { databaseConnectionService } from "../../../services/database-connection.service";

export class MongoDatabaseDriver implements DatabaseDriver {
  getMetadata(): DatabaseDriverMetadata {
    return {
      type: "mongodb",
      displayName: "MongoDB",
      consoleLanguage: "mongodb",
    } as any;
  }

  async getTreeRoot(_database: IDatabase): Promise<DatabaseTreeNode[]> {
    return [
      {
        id: "collections",
        label: "Collections",
        kind: "group",
        hasChildren: true,
      },
      { id: "views", label: "Views", kind: "group", hasChildren: true },
    ];
  }

  async getChildren(
    database: IDatabase,
    parent: { kind: string; id: string; metadata?: any },
  ): Promise<DatabaseTreeNode[]> {
    if (parent.id === "collections") {
      const client = await databaseConnectionService.getConnection(database);
      const db = client.db(database.connection.database);
      const collections = await db
        .listCollections({ type: { $ne: "view" } })
        .toArray();
      return collections
        .map((c: any) => c.name)
        .sort((a: string, b: string) => a.localeCompare(b))
        .map(
          (name: string): DatabaseTreeNode => ({
            id: name,
            label: name,
            kind: "collection",
            hasChildren: false,
          }),
        );
    }
    if (parent.id === "views") {
      const client = await databaseConnectionService.getConnection(database);
      const db = client.db(database.connection.database);
      const views = await db.listCollections({ type: "view" }).toArray();
      return views
        .map((v: any) => v.name)
        .sort((a: string, b: string) => a.localeCompare(b))
        .map(
          (name: string): DatabaseTreeNode => ({
            id: name,
            label: name,
            kind: "view",
            hasChildren: false,
          }),
        );
    }
    return [];
  }

  async executeQuery(database: IDatabase, query: string, options?: any) {
    return databaseConnectionService.executeQuery(database, query, options);
  }
}
