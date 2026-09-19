/**
 * Configuration modules for the Identity service.
 */

export type {
  AppConfig,
  DatabaseConfig,
  SecurityConfig,
  ServiceConfig,
} from "../interfaces/index.js";
export { createAppConfig } from "./app.config.js";
export { createDatabaseConfig } from "./database.config.js";
export { createSecurityConfig } from "./security.config.js";
export { createServiceConfig } from "./service.config.js";
