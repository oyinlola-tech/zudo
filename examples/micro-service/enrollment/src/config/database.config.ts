import type { DatabaseConfig } from "../interfaces/index.js";

/**
 * Creates the database configuration from environment variables.
 * @returns The resolved database config.
 */
export function createDatabaseConfig(): DatabaseConfig {
  return {
    filename: process.env["DATABASE_FILENAME"] ?? "./data/enrollment.db",
    verbose: process.env["DATABASE_VERBOSE"] === "true",
  };
}
