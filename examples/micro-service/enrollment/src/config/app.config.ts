import type { AppConfig } from "../interfaces/index.js";

/**
 * Creates the application configuration from environment variables.
 * @returns The resolved application config.
 */
export function createAppConfig(): AppConfig {
  return {
    name: "campusflow-enrollment",
    version: "0.1.0",
    env: (process.env["NODE_ENV"] as AppConfig["env"]) ?? "development",
    port: parseInt(process.env["PORT"] ?? "3000", 10),
    host: process.env["HOST"] ?? "localhost",
  };
}
