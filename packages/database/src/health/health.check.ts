import { DatabaseError, DatabaseOperation, ErrorCode } from "@zudojs/errors";

import type { DatabaseClient } from "../databaseClient/databaseClient.core.js";
import {
  isDatabaseErrorLike,
  normalizeDatabaseError,
} from "../databaseClient/databaseClient.errors.js";

/**
 * Health status of the database.
 */
export type DatabaseHealthStatus = "healthy" | "unhealthy" | "degraded";

/**
 * Detailed database health information.
 */
export interface DatabaseHealth {
  readonly status: DatabaseHealthStatus;
  readonly healthy: boolean;
  readonly latencyMs: number;
  readonly checkedAt: Date;
  readonly message?: string;
  readonly error?: {
    readonly name: string;
    readonly message: string;
    readonly code?: string;
    readonly databaseCode?: string;
  };
}

/**
 * Database health check options.
 */
export interface DatabaseHealthOptions {
  readonly timeoutMs?: number;
}

/**
 * Result of a database readiness check.
 */
export interface DatabaseReadiness {
  readonly ready: boolean;
  readonly checkedAt: Date;
  readonly latencyMs: number;
  readonly message?: string;
}

/**
 * Default database health-check timeout.
 */
export const DEFAULT_HEALTH_TIMEOUT_MS = 5_000;

/**
 * Error raised by {@link assertDatabaseHealth}. The underlying failure is
 * preserved as `cause`.
 */
export class DatabaseUnhealthyError extends DatabaseError {
  public readonly health: DatabaseHealth;

  constructor(health: DatabaseHealth, cause: unknown) {
    super("Database health check failed.", {
      code: ErrorCode.DATABASE_CONNECTION,
      statusCode: 503,
      operation: DatabaseOperation.CONNECT,
      metadata: {
        status: health.status,
        latencyMs: health.latencyMs,
        checkedAt: health.checkedAt.toISOString(),
        ...(health.error?.code ? { errorCode: health.error.code } : {}),
        ...(health.error?.databaseCode
          ? { databaseCode: health.error.databaseCode }
          : {}),
      },
      cause,
    });
    this.name = "DatabaseUnhealthyError";
    this.health = health;
  }
}

/**
 * Performs a lightweight database health check.
 */
export async function checkDatabaseHealth(
  client: DatabaseClient,
  options: DatabaseHealthOptions = {},
): Promise<DatabaseHealth> {
  if (!client) {
    throw new TypeError("A database client is required.");
  }

  const timeoutMs = normalizeTimeout(options.timeoutMs);
  const checkedAt = new Date();
  const startedAt = performance.now();

  try {
    await withTimeout(executeHealthCheck(client), timeoutMs);
    const latencyMs = elapsed(startedAt);
    return {
      status: latencyMs > timeoutMs * 0.75 ? "degraded" : "healthy",
      healthy: true,
      latencyMs,
      checkedAt,
      message: "Database connection is healthy.",
    };
  } catch (error) {
    const latencyMs = elapsed(startedAt);
    const normalizedError = normalizeHealthError(error);
    const health: DatabaseHealth = {
      status: "unhealthy",
      healthy: false,
      latencyMs,
      checkedAt,
      message: normalizedError.message,
      error: normalizedError,
    };
    Object.defineProperty(health, HEALTH_CAUSE, { value: error, enumerable: false });
    return health;
  }
}

/**
 * Symbol under which the original failure is kept on an unhealthy result.
 * It is a non-enumerable symbol key, so serialised health output never
 * includes it.
 */
const HEALTH_CAUSE: unique symbol = Symbol("zudojs.database.healthCause");

/**
 * Returns the original error that made a health check fail, if any.
 */
export function getHealthCheckCause(health: DatabaseHealth): unknown {
  return (health as unknown as Record<symbol, unknown>)[HEALTH_CAUSE];
}

/**
 * Performs a database readiness check.
 *
 * Readiness is intentionally stricter than health. A degraded
 * connection remains healthy but may still be considered ready.
 */
export async function checkDatabaseReadiness(
  client: DatabaseClient,
  options: DatabaseHealthOptions = {},
): Promise<DatabaseReadiness> {
  if (!client) {
    throw new TypeError("A database client is required.");
  }

  const timeoutMs = normalizeTimeout(options.timeoutMs);
  const checkedAt = new Date();
  const startedAt = performance.now();

  try {
    await withTimeout(executeHealthCheck(client), timeoutMs);
    return {
      ready: true,
      checkedAt,
      latencyMs: elapsed(startedAt),
      message: "Database is ready.",
    };
  } catch (error) {
    return {
      ready: false,
      checkedAt,
      latencyMs: elapsed(startedAt),
      message: normalizeHealthError(error).message,
    };
  }
}

/**
 * Throws a {@link DatabaseUnhealthyError} (with the real failure as
 * `cause`) when the database is not healthy.
 */
export async function assertDatabaseHealth(
  client: DatabaseClient,
  options: DatabaseHealthOptions = {},
): Promise<DatabaseHealth> {
  const health = await checkDatabaseHealth(client, options);
  if (!health.healthy) {
    throw new DatabaseUnhealthyError(health, getHealthCheckCause(health));
  }
  return health;
}

/**
 * Checks whether a database is reachable.
 */
export async function isDatabaseHealthy(
  client: DatabaseClient,
  options: DatabaseHealthOptions = {},
): Promise<boolean> {
  const health = await checkDatabaseHealth(client, options);
  return health.healthy;
}

/**
 * Executes the lightweight health query. Errors are already normalised by
 * the client, so they are passed through unchanged.
 */
async function executeHealthCheck(client: DatabaseClient): Promise<void> {
  await client.queryRawUnsafe("SELECT 1 AS result");
}

async function withTimeout<TValue>(
  promise: Promise<TValue>,
  timeoutMs: number,
): Promise<TValue> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<TValue>((_resolve, reject) => {
        timeout = setTimeout(() => {
          reject(
            new DatabaseError(
              `Database health check timed out after ${timeoutMs}ms.`,
              {
                code: ErrorCode.DATABASE_TIMEOUT,
                statusCode: 503,
                operation: DatabaseOperation.QUERY,
                metadata: { timeoutMs },
              },
            ),
          );
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function normalizeTimeout(timeoutMs?: number): number {
  if (timeoutMs === undefined) return DEFAULT_HEALTH_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError(
      "Database health timeout must be a positive finite number.",
    );
  }
  return Math.floor(timeoutMs);
}

function elapsed(startedAt: number): number {
  return Math.max(0, Math.round(performance.now() - startedAt));
}

/**
 * Converts an unknown error into a safe health error. Prisma errors are
 * mapped so connection failures never leak host names.
 */
function normalizeHealthError(error: unknown): NonNullable<DatabaseHealth["error"]> {
  const normalized = isDatabaseErrorLike(error)
    ? error
    : normalizeDatabaseError(error, {
        operation: DatabaseOperation.QUERY,
        fallbackMessage: "Database health check failed.",
      });
  return {
    name: normalized.name,
    message: normalized.message,
    code: String(normalized.code),
    ...(normalized.databaseCode !== undefined
      ? { databaseCode: String(normalized.databaseCode) }
      : {}),
  };
}
