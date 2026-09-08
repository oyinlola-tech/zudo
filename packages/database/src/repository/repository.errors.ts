import {
  DatabaseError,
  DatabaseOperation,
  ErrorCode,
  type DatabaseErrorOptions,
  type ErrorMetadata,
  type ErrorMetadataValue,
} from "@zudojs/errors";

import { isDatabaseErrorLike } from "../databaseClient/databaseClient.errors.js";

/**
 * Repository operation names used for error diagnostics.
 */
export type RepositoryOperation =
  | "findById"
  | "findOne"
  | "findMany"
  | "findPaginated"
  | "findByQuery"
  | "paginateCursor"
  | "findDeleted"
  | "count"
  | "exists"
  | "create"
  | "createMany"
  | "update"
  | "upsert"
  | "softDelete"
  | "restore"
  | "delete"
  | "deleteMany";

/**
 * Context attached to a mapped repository error.
 */
export interface RepositoryErrorContext {
  readonly model: string;
  readonly operation: RepositoryOperation | string;
  readonly durationMs: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Shape of a Prisma known request error, detected structurally so the
 * mapper does not depend on which `@prisma/client` copy raised it.
 */
export interface PrismaErrorLike {
  readonly code: string;
  readonly message: string;
  readonly meta?: Readonly<Record<string, unknown>>;
  readonly clientVersion?: string;
}

const PRISMA_CODE_PATTERN = /^P\d{4}$/;

/**
 * Determines whether a value looks like a Prisma known request error.
 */
export function isPrismaErrorLike(value: unknown): value is PrismaErrorLike {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const candidate = value as { code?: unknown; message?: unknown };

  return (
    typeof candidate.code === "string" &&
    PRISMA_CODE_PATTERN.test(candidate.code) &&
    typeof candidate.message === "string"
  );
}

/**
 * Maps a repository operation name to the errors package operation enum.
 */
export function toDatabaseOperation(
  operation: RepositoryOperation | string,
): DatabaseOperation {
  switch (operation) {
    case "create":
    case "createMany":
      return DatabaseOperation.INSERT;

    case "update":
    case "upsert":
    case "softDelete":
    case "restore":
      return DatabaseOperation.UPDATE;

    case "delete":
    case "deleteMany":
      return DatabaseOperation.DELETE;

    case "findById":
    case "findOne":
    case "findMany":
    case "findPaginated":
    case "findByQuery":
    case "paginateCursor":
    case "findDeleted":
    case "count":
    case "exists":
      return DatabaseOperation.QUERY;

    default:
      return DatabaseOperation.UNKNOWN;
  }
}

/**
 * Normalizes any failure raised by a repository operation into a
 * `DatabaseError`, mapping Prisma error codes to typed outcomes:
 *
 * - `P2002` unique violation → `ERR_CONFLICT` / 409
 * - `P2025` record not found → `ERR_NOT_FOUND` / 404
 * - `P2003` foreign key violation → `ERR_CONFLICT` / 409
 * - `P2034` serialization failure → `ERR_DATABASE_TRANSACTION` / 409 (retryable)
 * - `P2024` pool timeout → `ERR_DATABASE_TIMEOUT` / 503
 * - `P1xxx` connection failures → `ERR_DATABASE_CONNECTION` / 503
 *
 * Existing `DatabaseError`s are returned unchanged.
 */
export function mapRepositoryError(
  error: unknown,
  context: RepositoryErrorContext,
): DatabaseError {
  if (isDatabaseErrorLike(error)) {
    return error;
  }

  const operation = toDatabaseOperation(context.operation);

  const metadata: Record<string, ErrorMetadataValue | undefined> = {
    ...toErrorMetadata(context.metadata),
    model: context.model,
    operation: context.operation,
    durationMs: context.durationMs,
  };

  const base: DatabaseErrorOptions = {
    cause: error,
    operation,
    driver: "prisma",
  };

  if (!isPrismaErrorLike(error)) {
    return new DatabaseError(
      error instanceof Error
        ? error.message
        : `${context.model} ${context.operation} failed.`,
      {
        ...base,
        driver: undefined,
        metadata,
      },
    );
  }

  const target = extractTarget(error.meta);

  if (target !== undefined) {
    metadata["target"] = target;
  }

  const fieldName = error.meta?.["field_name"];

  if (typeof fieldName === "string") {
    metadata["field"] = fieldName;
  }

  const options: DatabaseErrorOptions = {
    ...base,
    databaseCode: error.code,
    metadata,
  };

  switch (error.code) {
    case "P2002":
      return new DatabaseError(`${context.model} already exists.`, {
        ...options,
        code: ErrorCode.CONFLICT,
        statusCode: 409,
        expose: true,
      });

    case "P2025":
      return new DatabaseError(`${context.model} was not found.`, {
        ...options,
        code: ErrorCode.NOT_FOUND,
        statusCode: 404,
        expose: true,
      });

    case "P2003":
      return new DatabaseError(
        `${context.model} ${context.operation} violates a foreign key constraint.`,
        {
          ...options,
          code: ErrorCode.CONFLICT,
          statusCode: 409,
          expose: true,
        },
      );

    case "P2034":
      return new DatabaseError(
        `${context.model} ${context.operation} failed due to a transaction conflict.`,
        {
          ...options,
          code: ErrorCode.DATABASE_TRANSACTION,
          statusCode: 409,
          metadata: { ...metadata, retryable: true },
        },
      );

    case "P2024":
      return new DatabaseError(
        `${context.model} ${context.operation} timed out waiting for a connection.`,
        {
          ...options,
          code: ErrorCode.DATABASE_TIMEOUT,
          statusCode: 503,
        },
      );

    default:
      break;
  }

  if (error.code.startsWith("P1")) {
    return new DatabaseError(
      `${context.model} ${context.operation} failed: database unavailable.`,
      {
        ...options,
        code: ErrorCode.DATABASE_CONNECTION,
        statusCode: 503,
      },
    );
  }

  return new DatabaseError(`${context.model} ${context.operation} failed.`, {
    ...options,
    code: ErrorCode.DATABASE_QUERY,
  });
}

/**
 * Creates the error raised when an operation is aborted via `AbortSignal`.
 */
export function createAbortError(
  context: Omit<RepositoryErrorContext, "durationMs">,
  reason?: unknown,
): DatabaseError {
  return new DatabaseError(
    `${context.model} ${context.operation} was aborted.`,
    {
      code: ErrorCode.OPERATION_CANCELLED,
      statusCode: 499,
      operation: toDatabaseOperation(context.operation),
      cause: reason,
      metadata: {
        ...toErrorMetadata(context.metadata),
        model: context.model,
        operation: context.operation,
        aborted: true,
      },
    },
  );
}

/**
 * Creates the error raised when a client-side timeout elapses.
 */
export function createTimeoutError(
  context: Omit<RepositoryErrorContext, "durationMs">,
  timeoutMs: number,
): DatabaseError {
  return new DatabaseError(
    `${context.model} ${context.operation} timed out after ${timeoutMs}ms.`,
    {
      code: ErrorCode.DATABASE_TIMEOUT,
      statusCode: 503,
      operation: toDatabaseOperation(context.operation),
      metadata: {
        ...toErrorMetadata(context.metadata),
        model: context.model,
        operation: context.operation,
        timeoutMs,
      },
    },
  );
}

/**
 * Converts arbitrary metadata into the serializable shape the errors
 * package accepts.
 */
export function toErrorMetadata(
  value?: Readonly<Record<string, unknown>>,
): ErrorMetadata {
  const result: Record<string, ErrorMetadataValue | undefined> = {};

  if (!value) {
    return result;
  }

  for (const [key, entry] of Object.entries(value)) {
    result[key] = toMetadataValue(entry);
  }

  return result;
}

function toMetadataValue(value: unknown): ErrorMetadataValue | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map((entry) => toMetadataValue(entry) ?? null);
  }

  if (typeof value === "object") {
    const result: Record<string, ErrorMetadataValue> = {};

    for (const [key, entry] of Object.entries(value)) {
      const converted = toMetadataValue(entry);

      if (converted !== undefined) {
        result[key] = converted;
      }
    }

    return result;
  }

  return String(value);
}

function extractTarget(
  meta?: Readonly<Record<string, unknown>>,
): ErrorMetadataValue | undefined {
  const target = meta?.["target"];

  if (typeof target === "string") {
    return target;
  }

  if (Array.isArray(target)) {
    return target.map((entry) => String(entry));
  }

  return undefined;
}
