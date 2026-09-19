import type { ServiceConfig } from "../interfaces/index.js";

/**
 * Creates the service configuration.
 * @returns The resolved service config.
 */
export function createServiceConfig(): ServiceConfig {
  return {
    serviceId: process.env["SERVICE_ID"] ?? "enrollment-service",
    serviceName: process.env["SERVICE_NAME"] ?? "CampusFlow Enrollment Service",
    version: process.env["SERVICE_VERSION"] ?? "0.1.0",
  };
}
