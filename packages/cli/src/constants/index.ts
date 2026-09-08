/**
 * zudojs-cli — Constants
 *
 * Constants used by the CLI scaffolding system.
 */

export const CLI_VERSION = "0.1.2" as const;

/** Published version of all @zudojs/* framework packages. */
export const ZUDOJS_PACKAGES_VERSION = "0.1.0" as const;

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
