/**
 * zudojs-cli — MySQL Database Adapter
 */

import type { DatabaseAdapter } from "./postgres.adapter.js";

export class MySqlAdapter implements DatabaseAdapter {
  readonly name = "mysql";
  readonly driver = "mysql";

  getConnectionString(dbName: string): string {
    return `mysql://localhost:3306/${dbName}`;
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
