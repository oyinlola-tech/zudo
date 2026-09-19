import type { DatabaseConfig } from "../interfaces/index.js";

/**
 * Creates the database configuration from environment variables.
 */
export function createDatabaseConfig(): DatabaseConfig {
  return {
    filename: process.env.DATABASE_FILENAME ?? "./data/identity.db",
  };
}
