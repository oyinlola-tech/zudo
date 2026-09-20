/**
 * zudojs-cli — Constants
 *
 * Constants used by the CLI scaffolding system.
 */

import type {
  BackendArchitecture,
  DatabaseProvider,
  PackageManagerType,
} from "../types/projectConfiguration.type.js";

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

/** A selectable answer offered by a prompt. */
export interface CLIChoiceOption<Value extends string = string> {
  readonly value: Value;
  readonly label: string;
  readonly hint?: string;
}

/** Backend architectures offered by `zudojs create`. */
export const ARCHITECTURE_CHOICES: readonly CLIChoiceOption<BackendArchitecture>[] =
  Object.freeze([
    { value: "monolith", label: "Monolith", hint: "Single application" },
    {
      value: "modular-monolith",
      label: "Modular Monolith",
      hint: "Modular single application",
    },
    {
      value: "microservice",
      label: "Microservices",
      hint: "Independent services",
    },
  ]);

/** Package managers the CLI can install with. */
export const PACKAGE_MANAGER_CHOICES: readonly CLIChoiceOption<PackageManagerType>[] =
  Object.freeze([
    { value: "pnpm", label: "pnpm" },
    { value: "npm", label: "npm" },
    { value: "yarn", label: "Yarn" },
    { value: "bun", label: "Bun" },
  ]);

/** Database engines the CLI has adapters for. */
export const DATABASE_CHOICES: readonly CLIChoiceOption<DatabaseProvider>[] =
  Object.freeze([
    {
      value: "postgresql",
      label: "PostgreSQL",
      hint: "Recommended for production",
    },
    {
      value: "mysql",
      label: "MySQL",
      hint: "Widely used relational database",
    },
    { value: "sqlite", label: "SQLite", hint: "Lightweight, file-based" },
  ]);

/**
 * Features `zudojs add` accepts.
 *
 * Derived from `FEATURE_PACKAGES` so the two cannot drift: the hand-written
 * list named six of the ten installable features.
 */
export const FEATURE_CHOICES: readonly CLIChoiceOption[] = Object.freeze(
  Object.keys(FEATURE_PACKAGES).map((value) =>
    Object.freeze({ value, label: value }),
  ),
);

/**
 * Schematics `zudojs generate` accepts, in the order the help lists them.
 *
 * This is the canonical list; the hand-written one named six of thirteen.
 */
export const SCHEMA_CHOICES: readonly CLIChoiceOption[] = Object.freeze([
  { value: "service", label: "Service (CQRS)" },
  { value: "module", label: "Module" },
  { value: "command", label: "Command" },
  { value: "query", label: "Query" },
  { value: "controller", label: "Controller" },
  { value: "repository", label: "Repository" },
  { value: "middleware", label: "Middleware" },
  { value: "event", label: "Event" },
  { value: "job", label: "Job" },
  { value: "route", label: "Route" },
  { value: "model", label: "Model" },
  { value: "dto", label: "DTO" },
  { value: "validator", label: "Validator" },
]);

/** Names only, for help text and validation messages. */
export const SCHEMATIC_NAMES: readonly string[] = Object.freeze(
  SCHEMA_CHOICES.map((choice) => choice.value),
);

/** Feature names only, for help text and validation messages. */
export const FEATURE_NAMES: readonly string[] = Object.freeze(
  FEATURE_CHOICES.map((choice) => choice.value),
);

export const DEFAULT_ARCHITECTURE = "monolith" as const satisfies BackendArchitecture;
export const DEFAULT_PACKAGE_MANAGER = "pnpm" as const satisfies PackageManagerType;
export const DEFAULT_DATABASE = "postgresql" as const satisfies DatabaseProvider;
