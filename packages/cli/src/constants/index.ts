/**
 * zudojs-cli — Constants
 *
 * Constants used by the CLI scaffolding system.
 */

export { CLI_VERSION } from "../cliConstant/cliVersion.js";

/**
 * Version range every generated project depends on for `@zudojs/*` packages.
 *
 * This is a caret range, not an exact pin, on purpose. The framework
 * packages are released independently, so at any moment their latest
 * versions differ (`@zudojs/openapi` went to 1.1.0 while the rest stayed at
 * 1.0.0). An exact `1.0.0` pin made `pnpm install` in every freshly created
 * project abort with `ERR_PNPM_NO_MATCHING_VERSION` for the package that had
 * moved on. A range resolves each package to its newest compatible release.
 */
export const ZUDOJS_PACKAGES_VERSION = "^1.0.0" as const;

/**
 * Packages installed by `zudojs add <feature>`.
 *
 * Also used by `zudojs doctor` to verify that every feature recorded in a
 * project is backed by its package.
 */
export const FEATURE_PACKAGES: Readonly<Record<string, readonly string[]>> = {
  database: ["@zudojs/database"],
  queue: ["@zudojs/queue"],
  messaging: ["@zudojs/messaging"],
  openapi: ["@zudojs/openapi"],
  observability: ["@zudojs/observability"],
  security: ["@zudojs/security"],
  cache: ["@zudojs/cache"],
  storage: ["@zudojs/storage"],
  // Used to install @zudojs/queue; the scheduler package exists and is the
  // one the feature name promises.
  scheduler: ["@zudojs/scheduler"],
  docs: ["@zudojs/docs"],
};

export const ARCHITECTURE_CHOICES = [
  { value: "monolith", label: "Monolith" },
  { value: "modular-monolith", label: "Modular Monolith" },
  { value: "microservice", label: "Microservice" },
] as const;

export const PACKAGE_MANAGER_CHOICES = [
  { value: "pnpm", label: "pnpm" },
  { value: "npm", label: "npm" },
  { value: "yarn", label: "yarn" },
] as const;

export const DATABASE_CHOICES = [
  { value: "postgresql", label: "PostgreSQL" },
  { value: "mysql", label: "MySQL" },
  { value: "sqlite", label: "SQLite" },
] as const;

export const FEATURE_CHOICES = [
  { value: "database", label: "Database" },
  { value: "queue", label: "Queue" },
  { value: "messaging", label: "Messaging" },
  { value: "openapi", label: "OpenAPI" },
  { value: "observability", label: "Observability" },
  { value: "security", label: "Security" },
] as const;

export const SCHEMA_CHOICES = [
  { value: "service", label: "Service (CQRS)" },
  { value: "module", label: "Module" },
  { value: "command", label: "Command" },
  { value: "query", label: "Query" },
  { value: "controller", label: "Controller" },
  { value: "repository", label: "Repository" },
] as const;

export const DEFAULT_ARCHITECTURE = "monolith" as const;
export const DEFAULT_PACKAGE_MANAGER = "pnpm" as const;
export const DEFAULT_DATABASE = "postgresql" as const;
