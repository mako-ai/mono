import * as fs from "fs";
import * as path from "path";

export interface QueryFile {
  path: string;
  name: string;
  content: string;
  isDirectory: boolean;
  children?: QueryFile[];
}

export class QueryManager {
  private queriesDir: string;

  constructor() {
    // In Docker, queries are mounted to /app/queries
    this.queriesDir = path.join(process.cwd(), "queries");
    console.log(`📁 Queries directory: ${this.queriesDir}`);
  }

  /**
   * Get all queries in a tree structure
   */
  async listQueries(): Promise<QueryFile[]> {
    return this.scanDirectory("");
  }

  /**
   * Get content of a specific query file
   */
  async getQuery(queryPath: string): Promise<string> {
    const fullPath = path.join(this.queriesDir, `${queryPath}.js`);

    if (!fs.existsSync(fullPath)) {
      throw new Error(`Query file not found: ${queryPath}`);
    }

    return fs.readFileSync(fullPath, "utf8");
  }

  /**
   * Save query content to file
   */
  async saveQuery(queryPath: string, content: string): Promise<void> {
    const fullPath = path.join(this.queriesDir, `${queryPath}.js`);
    const dir = path.dirname(fullPath);

    // Ensure directory exists
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(fullPath, content, "utf8");
  }

  /**
   * Check if query exists
   */
  async queryExists(queryPath: string): Promise<boolean> {
    const fullPath = path.join(this.queriesDir, `${queryPath}.js`);
    return fs.existsSync(fullPath);
  }

  /**
   * Recursively scan directory for query files
   */
  private scanDirectory(relativePath: string): QueryFile[] {
    const fullPath = path.join(this.queriesDir, relativePath);

    if (!fs.existsSync(fullPath)) {
      console.warn(`Directory not found: ${fullPath}`);
      return [];
    }

    const items = fs.readdirSync(fullPath);
    const result: QueryFile[] = [];

    for (const item of items) {
      const itemPath = path.join(fullPath, item);
      const relativeItemPath = path.join(relativePath, item);
      const stat = fs.statSync(itemPath);

      if (stat.isDirectory()) {
        const children = this.scanDirectory(relativeItemPath);
        result.push({
          path: relativeItemPath,
          name: item,
          content: "",
          isDirectory: true,
          children,
        });
      } else if (item.endsWith(".js")) {
        const content = fs.readFileSync(itemPath, "utf8");
        const nameWithoutExt = item.replace(".js", "");
        result.push({
          path: relativeItemPath.replace(".js", ""),
          name: nameWithoutExt,
          content,
          isDirectory: false,
        });
      }
    }

    return result.sort((a, b) => {
      // Directories first, then files
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });
  }
}
