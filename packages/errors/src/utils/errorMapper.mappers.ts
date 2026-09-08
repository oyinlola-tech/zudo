/**
 * Error mapping functions — native error mapping, registry-based mapping, rule creation.
 */

import { BaseError } from "../base/core/baseError.core.js";
import type { ErrorMetadata } from "../base/core/errorMetadata.type.js";
import {
  isBaseError,
  normalizeUnknownToBaseError,
} from "../base/utils/baseError.utils.js";
import type {
  ErrorMapperContext,
  ErrorMapper,
  ErrorMapperPredicate,
  ErrorMapping,
  ErrorMappingRule,
} from "./errorMapper.types.js";
import type { ErrorMapperRegistry } from "./errorMapper.registry.js";

/**
 * Maps common native JavaScript errors.
 *
 * Native `TypeError`/`RangeError`/`SyntaxError` are overwhelmingly programmer
 * bugs rather than client input problems, so they are classified as
 * non-operational internal errors (500, not exposed). Register an explicit
 * mapping rule to treat a specific error type as client input.
 */
export function mapNativeError(error: unknown): BaseError | undefined {
  if (isBaseError(error)) {
    return error;
  }
  if (error instanceof Error) {
    return normalizeUnknownToBaseError(error, {
      metadata: { nativeErrorName: error.name },
    });
  }
  return undefined;
}

/** Maps an error using a registry and falls back to native error mapping. */
export function mapError(
  error: unknown,
  registry?: ErrorMapperRegistry,
  context?: ErrorMapperContext,
): BaseError {
  if (isBaseError(error)) {
    return error;
  }
  const mapped = registry?.map(error, context);
  if (mapped) {
    return mapped;
  }
  const native = mapNativeError(error);
  if (native) {
    return native;
  }
  return normalizeUnknownToBaseError(error);
}

/** Any constructor whose instances are `T` (parameters are not constrained). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ErrorConstructor<T extends Error> = abstract new (...args: any[]) => T;

/**
 * Creates a mapping rule for a specific error constructor.
 *
 * `mapper` may be a function producing a `BaseError`, or a declarative
 * `ErrorMapping` describing the resulting error.
 */
export function mapErrorType<T extends Error>(
  name: string,
  errorType: ErrorConstructor<T>,
  mapper: ((error: T, context?: ErrorMapperContext) => BaseError) | ErrorMapping,
  priority = 0,
): ErrorMappingRule {
  const mapFn: ErrorMapper =
    typeof mapper === "function"
      ? (error, context) => mapper(error as T, context)
      : (error, context) => applyErrorMapping(error, mapper, context);
  return {
    name,
    priority,
    predicate: (error) => error instanceof errorType,
    mapper: mapFn,
  };
}

/**
 * Creates a mapping rule based on a predicate.
 *
 * `mapper` may be a function producing a `BaseError`, or a declarative
 * `ErrorMapping` describing the resulting error.
 */
export function createErrorMappingRule(
  name: string,
  predicate: ErrorMapperPredicate,
  mapper: ErrorMapper | ErrorMapping,
  priority = 0,
): ErrorMappingRule {
  const mapFn: ErrorMapper =
    typeof mapper === "function"
      ? mapper
      : (error, context) => applyErrorMapping(error, mapper, context);
  return { name, predicate, mapper: mapFn, priority };
}

/** Builds a BaseError from a declarative `ErrorMapping`. */
export function applyErrorMapping(
  error: unknown,
  mapping: ErrorMapping,
  context?: ErrorMapperContext,
): BaseError {
  const message =
    mapping.message ??
    (error instanceof Error && error.message
      ? error.message
      : "An unexpected error occurred.");
  return new BaseError(message, {
    code: mapping.code,
    category: mapping.category,
    severity: mapping.severity,
    statusCode: mapping.statusCode,
    expose: mapping.expose,
    isOperational: mapping.isOperational,
    cause: error,
    metadata: {
      ...(context?.metadata as ErrorMetadata | undefined),
      ...(mapping.metadata as ErrorMetadata | undefined),
      ...(context?.requestId !== undefined
        ? { requestId: context.requestId }
        : {}),
    },
  });
}
