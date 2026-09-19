import type { AppConfig } from "../interfaces/index.js";

/**
 * Creates the application configuration from environment variables.
 */
export function createAppConfig(): AppConfig {
  return {
    name: process.env.APP_NAME ?? "campusflow-identity",
    port: Number(process.env.IDENTITY_PORT ?? 3001),
    host: process.env.IDENTITY_HOST ?? "localhost",
    env: process.env.NODE_ENV ?? "development",
  };
}
