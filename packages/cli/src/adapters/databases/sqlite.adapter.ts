/**
 * zudojs-cli — SQLite Database Adapter
 */

import type { DatabaseAdapter } from "./postgres.adapter.js";

export class SqliteAdapter implements DatabaseAdapter {
  readonly name = "sqlite";
  readonly driver = "sqlite";

  getConnectionString(dbName: string): string {
    return `sqlite:${dbName}.db`;
  }

  getDependencies(): readonly string[] {
    return ["@zudojs/database"];
  }

  getEnvironmentVariables(dbName = "mydb"): Record<string, string> {
    return {
      DATABASE_URL: this.getConnectionString(dbName),
    };
  }
}
