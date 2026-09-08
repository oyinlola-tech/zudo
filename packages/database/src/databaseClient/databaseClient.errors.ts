/**
 * @zudojs/database — Error normalisation
 *
 * Converts Prisma (and arbitrary) failures into `DatabaseError` instances
 * that carry the Prisma error code as `databaseCode`, the operation that
 * failed, and an HTTP-friendly status/code so callers can distinguish a
 * unique violation from a missing row from an outage without reaching into
 * `cause`.
 *
 * Prisma errors are detected structurally (a `code` such as `P2002` plus a
 * `clientVersion`), so the mapping works regardless of which copy of
 * `@prisma/client` produced the error.
 */

import {
  DatabaseError,
  DatabaseOperation,
  ErrorCategory,
  isDatabaseError,
  ErrorCode,
  type DatabaseErrorOptions,
} from "@zudojs/errors";

import type { DatabaseErrorInfo } from "../databaseType/databaseType.type.js";

/**
 * Structural `DatabaseError` guard.
 *
 * `@zudojs/errors` resolves from the npm registry (exact `0.1.0` pins are a
 * repo-wide convention), so a consumer may hold a second copy of the
 * package. `instanceof` would then fail and errors would be double-wrapped;
 * this guard accepts any `Error` that carries the `DatabaseError` shape
 * (`category: "database"` plus a string `code`).
 */
export function isDatabaseErrorLike(value: unknown): value is DatabaseError {
  if (isDatabaseError(value)) return true;
  if (!(value instanceof Error)) return false;
  const candidate = value as Partial<DatabaseError>;
  return (
    candidate.category === ErrorCategory.DATABASE &&
    typeof candidate.code === "string" &&
    typeof candidate.statusCode === "number"
  );
}

/**
 * Semantic outcome of a database failure.
 */
export type DatabaseErrorKind =
  | "conflict"
  | "not-found"
  | "constraint"
  | "serialization"
  | "timeout"
  | "connection"
  | "validation"
  | "unknown";

/**
 * Options for {@link normalizeDatabaseError}.
 */
export interface NormalizeDatabaseErrorOptions {
  /**
   * Operation that failed. Used when the error does not already carry one.
   */
  readonly operation?: DatabaseOperation;

  /**
   * Message used when the underlying error has none, or when the underlying
   * message must not be exposed (connection failures).
   */
  readonly fallbackMessage?: string;

  /**
   * Extra metadata merged into the normalised error.
   */
  readonly metadata?: DatabaseErrorOptions["metadata"];
}

/**
 * Minimal structural view of a Prisma known-request / initialization error.
 */
export interface PrismaErrorLike {
  readonly code?: string;
  readonly errorCode?: string;
  readonly meta?: Readonly<Record<string, unknown>>;
  readonly clientVersion?: string;
  readonly message?: string;
  readonly retryable?: boolean;
}

interface CodeMapping {
  readonly kind: DatabaseErrorKind;
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly message: string;
  readonly expose: boolean;
}

const CONNECTION_MESSAGE = "Database connection failed.";

const PRISMA_CODE_MAP: Readonly<Record<string, CodeMapping>> = Object.freeze({
  // Query engine errors
  P2000: {
    kind: "validation",
    statusCode: 400,
    code: ErrorCode.DATABASE_QUERY,
    message: "A value is too long for its column.",
    expose: true,
  },
  P2002: {
    kind: "conflict",
    statusCode: 409,
    code: ErrorCode.CONFLICT,
    message: "A record with the same unique value already exists.",
    expose: true,
  },
  P2003: {
    kind: "constraint",
    statusCode: 409,
    code: ErrorCode.CONFLICT,
    message: "A foreign key constraint was violated.",
    expose: true,
  },
  P2004: {
    kind: "constraint",
    statusCode: 409,
    code: ErrorCode.CONFLICT,
    message: "A database constraint was violated.",
    expose: true,
  },
  P2011: {
    kind: "constraint",
    statusCode: 400,
    code: ErrorCode.DATABASE_QUERY,
    message: "A required value was null.",
    expose: true,
  },
  P2014: {
    kind: "constraint",
    statusCode: 409,
    code: ErrorCode.CONFLICT,
    message: "A required relation would be violated.",
    expose: true,
  },
  P2015: {
    kind: "not-found",
    statusCode: 404,
    code: ErrorCode.RESOURCE_NOT_FOUND,
    message: "A related record could not be found.",
    expose: true,
  },
  P2018: {
    kind: "not-found",
    statusCode: 404,
    code: ErrorCode.RESOURCE_NOT_FOUND,
    message: "Required connected records were not found.",
    expose: true,
  },
  P2024: {
    kind: "timeout",
    statusCode: 503,
    code: ErrorCode.DATABASE_TIMEOUT,
    message: "Timed out acquiring a database connection from the pool.",
    expose: false,
  },
  P2025: {
    kind: "not-found",
    statusCode: 404,
    code: ErrorCode.RESOURCE_NOT_FOUND,
    message: "The requested record was not found.",
    expose: true,
  },
  P2028: {
    kind: "timeout",
    statusCode: 503,
    code: ErrorCode.DATABASE_TRANSACTION,
    message: "The database transaction timed out or was closed.",
    expose: false,
  },
  P2034: {
    kind: "serialization",
    statusCode: 409,
    code: ErrorCode.DATABASE_TRANSACTION,
    message: "The transaction failed due to a write conflict or deadlock.",
    expose: false,
  },
  // Connection / engine errors
  P1000: {
    kind: "connection",
    statusCode: 503,
    code: ErrorCode.DATABASE_CONNECTION,
    message: CONNECTION_MESSAGE,
    expose: false,
  },
  P1001: {
    kind: "connection",
    statusCode: 503,
    code: ErrorCode.DATABASE_CONNECTION,
    message: CONNECTION_MESSAGE,
    expose: false,
  },
  P1002: {
    kind: "timeout",
    statusCode: 503,
    code: ErrorCode.DATABASE_TIMEOUT,
    message: "The database server did not respond in time.",
    expose: false,
  },
  P1003: {
    kind: "connection",
    statusCode: 503,
    code: ErrorCode.DATABASE_CONNECTION,
    message: CONNECTION_MESSAGE,
    expose: false,
  },
  P1008: {
    kind: "timeout",
    statusCode: 503,
    code: ErrorCode.DATABASE_TIMEOUT,
    message: "The database operation timed out.",
    expose: false,
  },
  P1010: {
    kind: "connection",
    statusCode: 503,
    code: ErrorCode.DATABASE_CONNECTION,
    message: CONNECTION_MESSAGE,
    expose: false,
  },
  P1011: {
    kind: "connection",
    statusCode: 503,
    code: ErrorCode.DATABASE_CONNECTION,
    message: CONNECTION_MESSAGE,
    expose: false,
  },
  P1017: {
    kind: "connection",
    statusCode: 503,
    code: ErrorCode.DATABASE_CONNECTION,
    message: "The database server closed the connection.",
    expose: false,
  },
});

/**
 * Codes that indicate a transient transaction failure worth retrying.
 */
export const RETRYABLE_DATABASE_CODES: ReadonlySet<string> = new Set([
  "P2034", // Prisma: write conflict / deadlock
  "P2028", // Prisma: transaction closed / timed out
  "P1017", // Prisma: server closed the connection
  "40001", // PostgreSQL: serialization_failure
  "40P01", // PostgreSQL: deadlock_detected
]);

/**
 * Detects a Prisma error structurally.
 */
export function isPrismaError(value: unknown): value is PrismaErrorLike {
  if (!value || typeof value !== "object") return false;
  const candidate = value as PrismaErrorLike;
  const code = candidate.code ?? candidate.errorCode;
  return (
    typeof code === "string" &&
    /^P\d{4}$/.test(code) &&
    typeof candidate.clientVersion === "string"
  );
}

/**
 * Returns the Prisma / driver error code carried by an error, if any.
 */
export function getDatabaseErrorCode(error: unknown): string | undefined {
  if (isDatabaseErrorLike(error)) {
    if (error.databaseCode !== undefined) return String(error.databaseCode);
    return getDatabaseErrorCode(error.cause);
  }
  if (isPrismaError(error)) {
    return error.code ?? error.errorCode;
  }
  if (error && typeof error === "object") {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && code.length > 0) return code;
  }
  return undefined;
}

/**
 * Classifies a database error.
 */
export function getDatabaseErrorKind(error: unknown): DatabaseErrorKind {
  const code = getDatabaseErrorCode(error);
  if (code) {
    const mapping = PRISMA_CODE_MAP[code];
    if (mapping) return mapping.kind;
    if (code === "40001" || code === "40P01") return "serialization";
  }
  if (isDatabaseErrorLike(error)) {
    if (error.code === ErrorCode.DATABASE_CONNECTION) return "connection";
    if (error.code === ErrorCode.DATABASE_TIMEOUT) return "timeout";
    if (error.statusCode === 404) return "not-found";
    if (error.statusCode === 409) return "conflict";
  }
  return "unknown";
}

/**
 * Determines whether a transaction failure is safe to retry.
 *
 * Retrying re-runs the whole callback, so callbacks passed to
 * `withTransactionRetry` must be idempotent outside the transaction.
 */
export function isRetryableTransactionError(error: unknown): boolean {
  const code = getDatabaseErrorCode(error);
  if (code && RETRYABLE_DATABASE_CODES.has(code)) return true;
  if (isPrismaError(error) && error.retryable === true) return true;
  return getDatabaseErrorKind(error) === "serialization";
}

/**
 * Determines whether an error represents a unique-constraint conflict.
 */
export function isConflictError(error: unknown): boolean {
  const kind = getDatabaseErrorKind(error);
  return kind === "conflict" || kind === "constraint";
}

/**
 * Determines whether an error represents a missing record.
 */
export function isNotFoundError(error: unknown): boolean {
  return getDatabaseErrorKind(error) === "not-found";
}

/**
 * Returns a copy of a `DatabaseError` with extra metadata, preserving
 * `operation`, `driver` and `databaseCode` (which `BaseError.withMetadata`
 * drops).
 */
export function withDatabaseErrorMetadata(
  error: DatabaseError,
  metadata: NonNullable<DatabaseErrorOptions["metadata"]>,
): DatabaseError {
  return new DatabaseError(error.message, {
    code: error.code,
    category: error.category,
    severity: error.severity,
    statusCode: error.statusCode,
    expose: error.expose,
    isOperational: error.isOperational,
    operation: error.operation,
    driver: error.driver,
    databaseCode: error.databaseCode,
    metadata: { ...error.metadata, ...metadata },
    cause: error.cause,
  });
}

/**
 * Converts any thrown value into a `DatabaseError`.
 *
 * Existing `DatabaseError`s are returned as-is unless `operation` or
 * `metadata` need to be attached, in which case a copy carrying the extra
 * information (and the original as `cause`) is returned. Prisma errors are
 * mapped by code; connection failures get a fixed message so that host
 * names from Prisma's messages are never exposed.
 */
export function normalizeDatabaseError(
  error: unknown,
  options: NormalizeDatabaseErrorOptions = {},
): DatabaseError {
  const fallbackMessage = options.fallbackMessage ?? "A database operation failed.";

  if (isDatabaseErrorLike(error)) {
    // Subclasses (abort, unhealthy, unsupported dialect, ...) carry their
    // identity in the class, and instances from another copy of
    // @zudojs/errors must not be re-wrapped; only a plain DatabaseError from
    // this copy is rebuilt with the extra information.
    if (Object.getPrototypeOf(error) !== DatabaseError.prototype) return error;
    const needsOperation =
      options.operation !== undefined &&
      error.operation === DatabaseOperation.UNKNOWN;
    if (!needsOperation && !options.metadata) return error;
    return new DatabaseError(error.message, {
      code: error.code,
      category: error.category,
      severity: error.severity,
      statusCode: error.statusCode,
      expose: error.expose,
      isOperational: error.isOperational,
      operation: needsOperation ? options.operation : error.operation,
      driver: error.driver,
      databaseCode: error.databaseCode,
      metadata: { ...error.metadata, ...options.metadata },
      cause: error.cause ?? error,
    });
  }

  if (isPrismaError(error)) {
    const databaseCode = (error.code ?? error.errorCode) as string;
    const mapping = PRISMA_CODE_MAP[databaseCode];
    const meta = sanitizeMeta(error.meta);
    if (mapping) {
      return new DatabaseError(mapping.message, {
        code: mapping.code,
        statusCode: mapping.statusCode,
        expose: mapping.expose,
        operation: options.operation ?? inferOperation(mapping.kind),
        driver: "prisma",
        databaseCode,
        metadata: { ...meta, ...options.metadata, kind: mapping.kind },
        cause: error,
      });
    }
    const isConnection = databaseCode.startsWith("P1");
    return new DatabaseError(
      isConnection ? CONNECTION_MESSAGE : (error.message ?? fallbackMessage),
      {
        code: isConnection ? ErrorCode.DATABASE_CONNECTION : ErrorCode.DATABASE,
        statusCode: isConnection ? 503 : 500,
        expose: false,
        operation:
          options.operation ??
          (isConnection ? DatabaseOperation.CONNECT : DatabaseOperation.UNKNOWN),
        driver: "prisma",
        databaseCode,
        metadata: {
          ...meta,
          ...options.metadata,
          kind: isConnection ? "connection" : "unknown",
        },
        cause: error,
      },
    );
  }

  const message =
    error instanceof Error && error.message.length > 0
      ? error.message
      : fallbackMessage;

  return new DatabaseError(message, {
    operation: options.operation ?? DatabaseOperation.UNKNOWN,
    metadata: options.metadata,
    cause: error,
  });
}

function inferOperation(kind: DatabaseErrorKind): DatabaseOperation {
  switch (kind) {
    case "connection":
      return DatabaseOperation.CONNECT;
    case "serialization":
      return DatabaseOperation.TRANSACTION;
    default:
      return DatabaseOperation.QUERY;
  }
}

/**
 * Keeps only JSON-safe, non-sensitive fields from Prisma's `meta`.
 */
function sanitizeMeta(
  meta: Readonly<Record<string, unknown>> | undefined,
): Record<string, string | number | boolean | readonly string[]> {
  const result: Record<string, string | number | boolean | readonly string[]> =
    {};
  if (!meta) return result;
  for (const key of ["modelName", "target", "field_name", "constraint", "cause"]) {
    const value = meta[key];
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      result[key] = value;
    } else if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
      result[key] = Object.freeze([...(value as string[])]);
    }
  }
  return result;
}

/**
 * Converts any failure into a plain, serialisable {@link DatabaseErrorInfo}
 * (the shape exported for logging and API responses). The error is
 * normalised first, so Prisma codes appear as `code`.
 */
export function toDatabaseErrorInfo(
  error: unknown,
  options: NormalizeDatabaseErrorOptions = {},
): DatabaseErrorInfo {
  const normalized = normalizeDatabaseError(error, options);
  const metadata = normalized.metadata as Readonly<Record<string, unknown>>;
  const model = metadata["model"] ?? metadata["modelName"];
  const field = metadata["field"] ?? metadata["field_name"];
  const constraint = metadata["constraint"] ?? metadata["target"];
  return {
    code:
      normalized.databaseCode !== undefined
        ? String(normalized.databaseCode)
        : String(normalized.code),
    message: normalized.message,
    operation: normalized.operation,
    ...(typeof model === "string" ? { model } : {}),
    ...(typeof field === "string" ? { field } : {}),
    ...(typeof constraint === "string"
      ? { constraint }
      : Array.isArray(constraint)
        ? { constraint: constraint.join(",") }
        : {}),
    cause: normalized.cause,
    metadata,
  };
}
