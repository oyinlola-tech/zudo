/**
 * zudojs-cli — Database adapter lookup.
 *
 * `--database mysql|sqlite` used to be accepted and then ignored: every
 * template hard-coded a PostgreSQL `DATABASE_URL`, and the MySQL/SQLite
 * adapters were exported but never called. Templates and the
 * InfrastructureGenerator resolve the adapter here instead. `mongodb` has
 * no adapter, so it is rejected rather than silently turned into Postgres.
 */

import { CLIValidationError } from "../../errors/index.js";
import { MySqlAdapter } from "./mysql.adapter.js";
import type { DatabaseAdapter } from "./postgres.adapter.js";
import { PostgresAdapter } from "./postgres.adapter.js";
import { SqliteAdapter } from "./sqlite.adapter.js";

/** Database engines the CLI can scaffold. */
export const SUPPORTED_DATABASES = ["postgresql", "mysql", "sqlite"] as const;

const FACTORIES: ReadonlyMap<string, () => DatabaseAdapter> = new Map<
  string,
  () => DatabaseAdapter
>([
  ["postgresql", () => new PostgresAdapter()],
  ["mysql", () => new MySqlAdapter()],
  ["sqlite", () => new SqliteAdapter()],
]);

/**
 * Returns the adapter for a database engine.
 *
 * @throws {CLIValidationError} For an engine with no adapter (e.g. `mongodb`).
 */
export function resolveDatabaseAdapter(
  database: string = "postgresql",
): DatabaseAdapter {
  const factory = FACTORIES.get(database);
  if (!factory) {
    throw new CLIValidationError(
      `Unsupported database "${database}". Supported: ${SUPPORTED_DATABASES.join(", ")}.`,
    );
  }
  return factory();
}

/** Renders the adapter's environment variables as `.env` lines. */
export function renderDatabaseEnv(
  database: string | undefined,
  dbName: string,
): string {
  const variables =
    resolveDatabaseAdapter(database).getEnvironmentVariables(dbName);
  return Object.entries(variables)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}
