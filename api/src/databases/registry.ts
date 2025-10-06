import { DatabaseDriver, DatabaseDriverMetadata } from "./driver";

class DatabaseRegistry {
  private drivers: Map<string, DatabaseDriver> = new Map();

  register(driver: DatabaseDriver) {
    const meta = driver.getMetadata();
    this.drivers.set(meta.type, driver);
  }

  getDriver(type: string): DatabaseDriver | undefined {
    return this.drivers.get(type);
  }

  getAllMetadata(): DatabaseDriverMetadata[] {
    return Array.from(this.drivers.values()).map(d => d.getMetadata());
  }
}

export const databaseRegistry = new DatabaseRegistry();
