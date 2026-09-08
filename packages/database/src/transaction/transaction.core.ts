import { DatabaseOperation } from "@zudojs/errors";

import type {
  DatabaseClient,
  DatabaseTransactionContext,
} from "../databaseClient/databaseClient.core.js";
import {
  isDatabaseErrorLike,
  isRetryableTransactionError,
  normalizeDatabaseError,
  withDatabaseErrorMetadata,
} from "../databaseClient/databaseClient.errors.js";

import type {
  TransactionIsolationLevel,
  TransactionOptions,
} from "../databaseType/databaseType.type.js";

/**
 * Transaction state.
 */
export type TransactionStatus =
  "idle" | "active" | "committed" | "rolled-back" | "failed";

/**
 * Runtime transaction information.
 */
export interface TransactionContext {
  readonly transactionId: string;
  readonly startedAt: Date;
  readonly status: TransactionStatus;
  readonly isolationLevel?: TransactionIsolationLevel;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Result of {@link TransactionManager.run}: the callback result together
 * with the final (committed) transaction context.
 */
export interface TransactionOutcome<TResult> {
  readonly result: TResult;
  readonly context: TransactionContext;
}

/**
 * Options for creating a managed transaction.
 */
export interface ManagedTransactionOptions extends TransactionOptions {
  readonly transactionId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Options for {@link withTransactionRetry}.
 */
export interface TransactionRetryOptions extends ManagedTransactionOptions {
  /**
   * Maximum number of retries after the first attempt. Defaults to 3.
   */
  readonly retries?: number;

  /**
   * Base delay between attempts (doubles each retry). Defaults to 100 ms.
   */
  readonly retryDelayMs?: number;

  /**
   * Predicate deciding whether an error is retryable. Defaults to
   * {@link isRetryableTransactionError} (Prisma P2034/P2028/P1017 and
   * PostgreSQL 40001/40P01).
   */
  readonly shouldRetry?: (error: unknown, attempt: number) => boolean;
}

/**
 * Generates a transaction identifier.
 */
export function createTransactionId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 15)}`;
}

/**
 * Manages transaction execution and lifecycle metadata.
 */
export class TransactionManager {
  private readonly client: DatabaseClient;

  constructor(client: DatabaseClient) {
    if (!client) {
      throw new TypeError("A database client is required.");
    }
    this.client = client;
  }

  /**
   * Executes a callback inside a managed transaction and returns its
   * result.
   */
  public async execute<TResult>(
    callback: (
      transaction: DatabaseTransactionContext,
      context: TransactionContext,
    ) => Promise<TResult>,
    options: ManagedTransactionOptions = {},
  ): Promise<TResult> {
    const outcome = await this.run(callback, options);
    return outcome.result;
  }

  /**
   * Executes a callback inside a managed transaction and returns the
   * result together with the final context (`status: "committed"`).
   *
   * On failure the thrown `DatabaseError` carries `transactionId`,
   * `transactionStatus: "failed"` and the supplied metadata; use
   * {@link getTransactionContextFromError} to recover the context.
   */
  public async run<TResult>(
    callback: (
      transaction: DatabaseTransactionContext,
      context: TransactionContext,
    ) => Promise<TResult>,
    options: ManagedTransactionOptions = {},
  ): Promise<TransactionOutcome<TResult>> {
    if (typeof callback !== "function") {
      throw new TypeError("A transaction callback is required.");
    }

    const base = createTransactionContext(options);
    const activeContext = withStatus(base, "active");

    try {
      const result = await this.client.transaction(
        async (transaction) => callback(transaction, activeContext),
        options,
      );
      return { result, context: withStatus(base, "committed") };
    } catch (error) {
      const failed = withStatus(base, "failed");
      throw attachTransactionContext(
        normalizeDatabaseError(error, {
          operation: DatabaseOperation.TRANSACTION,
          fallbackMessage: "Database transaction failed.",
        }),
        failed,
      );
    }
  }

  /**
   * Returns the database client used by the manager.
   */
  public getClient(): DatabaseClient {
    return this.client;
  }
}

/**
 * Creates a transaction manager.
 */
export function createTransactionManager(
  client: DatabaseClient,
): TransactionManager {
  return new TransactionManager(client);
}

/**
 * Executes a managed database transaction.
 */
export async function withTransaction<TResult>(
  client: DatabaseClient,
  callback: (
    transaction: DatabaseTransactionContext,
    context: TransactionContext,
  ) => Promise<TResult>,
  options?: ManagedTransactionOptions,
): Promise<TResult> {
  return createTransactionManager(client).execute(callback, options);
}

/**
 * Executes a transaction with retry support.
 *
 * Retries re-run the whole callback with the same `transactionId`, so the
 * callback must be idempotent with respect to any side effects performed
 * outside the transaction client (for example, sending emails).
 */
export async function withTransactionRetry<TResult>(
  client: DatabaseClient,
  callback: (
    transaction: DatabaseTransactionContext,
    context: TransactionContext,
  ) => Promise<TResult>,
  options: TransactionRetryOptions = {},
): Promise<TResult> {
  const retries = Math.max(0, Math.floor(options.retries ?? 3));
  const retryDelayMs = Math.max(0, options.retryDelayMs ?? 100);
  const shouldRetry = options.shouldRetry ?? ((error) => isRetryableTransactionError(error));

  let attempt = 0;
  while (true) {
    try {
      return await withTransaction(client, callback, options);
    } catch (error) {
      if (attempt >= retries || !shouldRetry(error, attempt)) {
        throw error;
      }
      attempt += 1;
      const delay = retryDelayMs * Math.pow(2, attempt - 1);
      if (delay > 0) await sleep(delay);
    }
  }
}

/**
 * Creates an immutable transaction context.
 */
export function createTransactionContext(
  options: ManagedTransactionOptions = {},
): TransactionContext {
  return Object.freeze({
    transactionId: options.transactionId ?? createTransactionId(),
    startedAt: new Date(),
    status: "idle" as const,
    isolationLevel: options.isolationLevel,
    metadata: options.metadata ? Object.freeze({ ...options.metadata }) : undefined,
  });
}

/**
 * Recovers the failed transaction context attached to an error thrown by
 * {@link TransactionManager}, if any.
 */
export function getTransactionContextFromError(
  error: unknown,
): TransactionContext | undefined {
  if (!error || typeof error !== "object") return undefined;
  const context = (error as { [TRANSACTION_CONTEXT]?: TransactionContext })[
    TRANSACTION_CONTEXT
  ];
  return context;
}

const TRANSACTION_CONTEXT: unique symbol = Symbol("zudojs.database.transactionContext");

function attachTransactionContext<TError extends object>(
  error: TError,
  context: TransactionContext,
): TError {
  let enriched: TError = error;
  if (isDatabaseErrorLike(error)) {
    enriched = withDatabaseErrorMetadata(error, {
      transactionId: context.transactionId,
      transactionStatus: context.status,
      ...(context.isolationLevel ? { isolationLevel: context.isolationLevel } : {}),
      ...toErrorMetadata(context.metadata),
    }) as unknown as TError;
  }
  Object.defineProperty(enriched, TRANSACTION_CONTEXT, {
    value: context,
    enumerable: false,
  });
  return enriched;
}

function toErrorMetadata(
  metadata: Readonly<Record<string, unknown>> | undefined,
): Record<string, string | number | boolean | null> {
  const result: Record<string, string | number | boolean | null> = {};
  if (!metadata) return result;
  for (const [key, value] of Object.entries(metadata)) {
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      result[key] = value;
    } else if (value !== undefined) {
      result[key] = String(value);
    }
  }
  return result;
}

function withStatus(
  context: TransactionContext,
  status: TransactionStatus,
): TransactionContext {
  return Object.freeze({ ...context, status });
}

/**
 * Determines whether a transaction is currently active.
 */
export function isTransactionActive(context: TransactionContext): boolean {
  return context.status === "active";
}

/**
 * Determines whether a transaction completed successfully.
 */
export function isTransactionCommitted(context: TransactionContext): boolean {
  return context.status === "committed";
}

/**
 * Determines whether a transaction failed.
 */
export function isTransactionFailed(context: TransactionContext): boolean {
  return context.status === "failed";
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
