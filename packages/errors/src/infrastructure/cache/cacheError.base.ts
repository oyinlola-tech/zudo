/**
 * Cache error base class and options.
 */

import { BaseError } from "../../base/core/baseError.core.js";
import type { BaseErrorOptions } from "../../base/types/baseError.type.js";
import { ErrorCategory } from "../../base/types/errorCategory.type.js";
import { ErrorCode } from "../../base/types/errorCode.type.js";
import { ErrorSeverity } from "../../base/types/errorSeverity.type.js";

/** Cache operation types used for diagnostics. */
export enum CacheOperation {
  UNKNOWN = "unknown",
  GET = "get",
  SET = "set",
  DELETE = "delete",
  HAS = "has",
  CLEAR = "clear",
  KEYS = "keys",
  GET_MANY = "get_many",
  SET_MANY = "set_many",
  DELETE_MANY = "delete_many",
  TTL = "ttl",
  EXPIRE = "expire",
  LOCK_ACQUIRE = "lock_acquire",
  LOCK_RELEASE = "lock_release",
}

/** Options for creating a cache error. */
export interface CacheErrorOptions extends Omit<BaseErrorOptions, "category"> {
  readonly category?: ErrorCategory;
  /** Cache operation that failed. */
  readonly operation?: CacheOperation;
  /** Cache key involved in the operation. */
  readonly key?: string;
  /** Cache adapter name. */
  readonly adapter?: string;
}

/**
 * Error raised when a cache operation fails.
 */
export class CacheError extends BaseError {
  public readonly operation: CacheOperation;
  public readonly key?: string;
  public readonly adapter?: string;

  constructor(
    message = "A cache operation failed.",
    options: CacheErrorOptions = {},
  ) {
    super(message, {
      ...options,
      code: options.code ?? ErrorCode.CACHE,
      category: options.category ?? ErrorCategory.CACHE,
      severity: options.severity ?? ErrorSeverity.ERROR,
      statusCode: options.statusCode ?? 500,
      expose: options.expose ?? false,
      isOperational: options.isOperational ?? true,
      metadata: {
        ...options.metadata,
        ...(options.operation !== undefined
          ? { operation: options.operation }
          : {}),
        ...(options.key !== undefined ? { key: options.key } : {}),
        ...(options.adapter !== undefined ? { adapter: options.adapter } : {}),
      },
    });

    this.operation = options.operation ?? CacheOperation.UNKNOWN;
    this.key = options.key;
    this.adapter = options.adapter;
  }

  /** Returns a serialized representation with cache diagnostics. */
  public override toJSON() {
    return {
      ...super.toJSON(),
      operation: this.operation,
      ...(this.key !== undefined ? { key: this.key } : {}),
      ...(this.adapter !== undefined ? { adapter: this.adapter } : {}),
    };
  }
}

/** Determines whether an unknown value is a CacheError. */
export function isCacheError(value: unknown): value is CacheError {
  return value instanceof CacheError;
}
