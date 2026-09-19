import type { ServiceConfig } from "../interfaces/index.js";

/**
 * Creates the service configuration from environment variables.
 */
export function createServiceConfig(): ServiceConfig {
  return {
    port: Number(process.env.IDENTITY_PORT ?? 3001),
    host: process.env.IDENTITY_HOST ?? "localhost",
  };
}
