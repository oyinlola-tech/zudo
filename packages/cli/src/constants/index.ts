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
 * Legacy version range for `@zudojs/*` packages. Generated projects now use
 * {@link zudojsVersionRange}, which pins each package to the version this
 * CLI build targets; this remains for the few places that must name a
 * range without knowing the package.
 *
 * This is a caret range, not an exact pin, on purpose. The framework
 * packages are released independently, so at any moment their latest
 * versions differ (`@zudojs/openapi` went to 1.1.0 while the rest stayed at
 * 1.0.0). An exact `1.0.0` pin made `pnpm install` in every freshly created
 * project abort with `ERR_PNPM_NO_MATCHING_VERSION` for the package that had
 * moved on. A range resolves each package to its newest compatible release.
 */
export const ZUDOJS_PACKAGES_VERSION = "^1.0.0" as const;

export { ZUDOJS_PACKAGE_VERSIONS } from "./zudojsVersions.generated.js";
export {
  ZUDOJS_FALLBACK_VERSION_RANGE,
  zudojsDependencies,
  zudojsVersionRange,
} from "./zudojsVersions.helper.js";

/**
 * Packages that back each feature `zudojs add <feature>` accepts.
 *
 * Also used by `zudojs doctor` to verify that every feature recorded in a
 * project is backed by its package. `add` does more than install these: it
 * writes a working recipe for every feature (see `src/recipes/`), so a name
 * is only listed here when it has one. `docs` used to be accepted and only
 * installed `@zudojs/docs`, a documentation-site toolkit with nothing to
 * wire into an application; it is refused with an explanation instead.
 */
export const FEATURE_PACKAGES: Readonly<Record<string, readonly string[]>> = {
  database: ["@zudojs/database"],
  redis: ["redis"],
  websockets: ["ws"],
  email: ["nodemailer"],
  docker: [],
  queue: ["@zudojs/queue"],
  messaging: ["@zudojs/messaging"],
  openapi: ["@zudojs/openapi"],
  observability: ["@zudojs/observability"],
  cache: ["@zudojs/cache"],
  storage: ["@zudojs/storage"],
  // Used to install @zudojs/queue; the scheduler package exists and is the
  // one the feature name promises.
  scheduler: ["@zudojs/scheduler"],
};

/**
 * Other names `zudojs add` understands, mapped to the feature they mean.
 */
export const FEATURE_ALIASES: Readonly<Record<string, string>> = {
  postgres: "database",
  postgresql: "database",
  prisma: "database",
  websocket: "websockets",
  ws: "websockets",
  mail: "email",
};

/**
 * Names `zudojs add` refuses, with the reason. They were accepted once, or
 * are commonly guessed, but have no application recipe.
 */
export const FEATURE_REFUSALS: Readonly<Record<string, string>> = {
  security:
    "it is built in. Every generated server applies the @zudojs/security default headers, a CORS policy (CORS_ORIGINS) and per-client rate limiting (RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS), and depends on @zudojs/security already.",
  docs:
    "@zudojs/docs builds documentation sites; it has nothing to wire into an application. Install it directly with your package manager if you need it.",
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

/**
 * The package managers the CLI can install with.
 *
 * One canonical list. It previously existed three times — as
 * `VALID_PACKAGE_MANAGERS` in the create command, `PACKAGE_MANAGERS` in the
 * layout resolver and `SUPPORTED_MANAGERS` in the package-manager runner —
 * which is how `bun` came to be missing from the published choice list while
 * the CLI supported it everywhere else.
 */
export const PACKAGE_MANAGERS: readonly PackageManagerType[] = Object.freeze([
  "pnpm",
  "npm",
  "yarn",
  "bun",
]);

/** Package managers the CLI can install with, as prompt choices. */
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
  {
    value: "resource",
    label: "Resource",
    hint: "DTO, repository, service, controller, CRUD routes and a test, registered",
  },
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
