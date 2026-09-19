/**
 * zudojs-cli — Database Adapters
 *
 * Database adapters for project generation.
 */

export interface DatabaseAdapter {
  readonly name: string;
  readonly driver: string;

  getConnectionString(dbName: string): string;

  getDependencies(): readonly string[];

  /** Environment variables for a database named `dbName` (default "mydb"). */
  getEnvironmentVariables(dbName?: string): Record<string, string>;
}

export class PostgresAdapter implements DatabaseAdapter {
  readonly name = "postgresql";
  readonly driver = "postgres";

  getConnectionString(dbName: string): string {
    return `postgresql://localhost:5432/${dbName}`;
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

