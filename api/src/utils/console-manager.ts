import * as fs from "fs";
import * as path from "path";

export interface ConsoleFile {
  path: string;
  name: string;
  content: string;
  isDirectory: boolean;
  children?: ConsoleFile[];
}

export class ConsoleManager {
  private consolesDir: string;

  constructor() {
    // Allow overriding via environment variable
    const envDir = process.env.CONSOLES_DIR;

    const cwdDir = path.join(process.cwd(), "consoles");

    // Secondary candidate – parent directory (useful when the server is started from a sub-folder like /api)
    const parentDir = path.join(process.cwd(), "..", "consoles");

    // Determine which directory actually exists AND contains at least one entry
    let resolvedDir: string | undefined = undefined;

    const candidates = [envDir, parentDir, cwdDir].filter(Boolean) as string[];

    for (const dir of candidates) {
      if (fs.existsSync(dir)) {
        try {
          // Treat directory as valid only if it has files / sub-directories
          const items = fs.readdirSync(dir);
          if (items.length > 0) {
            resolvedDir = dir;
            break;
          }
        } catch (err) {
          // Ignore permission errors etc.
        }
      }
    }

    // Fallback to first existing directory (even if empty) or cwdDir
    if (!resolvedDir) {
      for (const dir of candidates) {
        if (fs.existsSync(dir)) {
          resolvedDir = dir;
          break;
        }
      }
    }

    this.consolesDir = resolvedDir || cwdDir;

    console.log(`📁 Consoles directory resolved to: ${this.consolesDir}`);
  }

  /**
   * Get all consoles in a tree structure
   */
  async listConsoles(): Promise<ConsoleFile[]> {
    const results = this.scanDirectory("");
    console.log(`🔍 listConsoles found ${results.length} top-level items.`);
    // Log details of the first few items to check isDirectory
    if (results.length > 0) {
      console.log(
        "Sample of first few console entries (before sending to client):"
      );
      results.slice(0, 3).forEach((entry) => {
        console.log(
          `  Path: ${entry.path}, Name: ${entry.name}, isDirectory: ${entry.isDirectory}, Children count: ${entry.children ? entry.children.length : 0}`
        );
        if (entry.children && entry.children.length > 0) {
          console.log(
            `    Child of ${entry.name} - Path: ${entry.children[0].path}, isDirectory: ${entry.children[0].isDirectory}`
          );
        }
      });
    }
    return results;
  }

  /**
   * Get content of a specific console file
   */
  async getConsole(consolePath: string): Promise<string> {
    const fullPath = path.join(this.consolesDir, `${consolePath}.js`);

    if (!fs.existsSync(fullPath)) {
      throw new Error(`Console file not found: ${consolePath}`);
    }

    return fs.readFileSync(fullPath, "utf8");
  }

  /**
   * Save console content to file
   */
  async saveConsole(consolePath: string, content: string): Promise<void> {
    const fullPath = path.join(this.consolesDir, `${consolePath}.js`);
    const dir = path.dirname(fullPath);

    // Ensure directory exists
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(fullPath, content, "utf8");
  }

  /**
   * Check if console exists
   */
  async consoleExists(consolePath: string): Promise<boolean> {
    const fullPath = path.join(this.consolesDir, `${consolePath}.js`);
    return fs.existsSync(fullPath);
  }

  /**
   * Recursively scan directory for console files
   */
  private scanDirectory(relativePath: string): ConsoleFile[] {
    const fullPath = path.join(this.consolesDir, relativePath);

    if (!fs.existsSync(fullPath)) {
      console.warn(`Directory not found: ${fullPath}`);
      return [];
    }

    const items = fs.readdirSync(fullPath);
    const result: ConsoleFile[] = [];

    for (const item of items) {
      const itemPath = path.join(fullPath, item);
      const relativeItemPath = path.join(relativePath, item);
      const stat = fs.statSync(itemPath);

      if (stat.isDirectory()) {
        const children = this.scanDirectory(relativeItemPath);
        result.push({
          path: relativeItemPath,
          name: item,
          content: "", // Directories don't have direct content in this model
          isDirectory: true,
          children,
        });
      } else if (item.endsWith(".js")) {
        const content = fs.readFileSync(itemPath, "utf8");
        const nameWithoutExt = item.replace(".js", "");
        result.push({
          path: relativeItemPath.replace(".js", ""), // Store path without .js extension
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
