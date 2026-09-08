/**
 * Timeout error factory functions for specific operations.
 *
 * Every factory accepts either an options object `{ timeoutMs, target }` or
 * the legacy positional arguments. The positional order differs between the
 * request/database factories (`timeoutMs, target`) and the service/lock
 * factories (`target, timeoutMs`); the object form is recommended.
 */

import { ErrorCategory } from "../../base/types/errorCategory.type.js";
import { ErrorCode } from "../../base/types/errorCode.type.js";
import { TimeoutError, TimeoutOperation } from "./timeoutError.base.js";

/** Arguments shared by the timeout factories. */
export interface TimeoutFactoryOptions {
  readonly timeoutMs?: number;
  readonly target?: string;
}

function resolveTimeoutArgs(
  first: number | string | TimeoutFactoryOptions | undefined,
  second: number | string | undefined,
  order: "timeoutFirst" | "targetFirst",
): TimeoutFactoryOptions {
  if (first !== undefined && typeof first === "object") return first;
  const [timeoutMs, target] =
    order === "timeoutFirst" ? [first, second] : [second, first];
  return {
    ...(typeof timeoutMs === "number" ? { timeoutMs } : {}),
    ...(typeof target === "string" ? { target } : {}),
  };
}

/** Creates a request timeout error. */
export function requestTimeoutError(
  options?: TimeoutFactoryOptions,
): TimeoutError;
export function requestTimeoutError(
  timeoutMs?: number,
  target?: string,
): TimeoutError;
export function requestTimeoutError(
  first?: number | TimeoutFactoryOptions,
  second?: string,
): TimeoutError {
  const { timeoutMs, target } = resolveTimeoutArgs(first, second, "timeoutFirst");
  return new TimeoutError(
    target ? `The request to ${target} timed out.` : "The request timed out.",
    {
      code: ErrorCode.TIMEOUT,
      operation: TimeoutOperation.REQUEST,
      timeoutMs,
      target,
    },
  );
}

/** Creates a database timeout error. */
export function databaseTimeoutError(
  options?: TimeoutFactoryOptions,
): TimeoutError;
export function databaseTimeoutError(
  timeoutMs?: number,
  target?: string,
): TimeoutError;
export function databaseTimeoutError(
  first?: number | TimeoutFactoryOptions,
  second?: string,
): TimeoutError {
  const { timeoutMs, target } = resolveTimeoutArgs(first, second, "timeoutFirst");
  return new TimeoutError("The database operation timed out.", {
    code: ErrorCode.DATABASE_TIMEOUT,
    category: ErrorCategory.DATABASE,
    operation: TimeoutOperation.DATABASE,
    timeoutMs,
    target,
  });
}

/** Creates an external-service timeout error. */
export function serviceTimeoutError(
  options?: TimeoutFactoryOptions,
): TimeoutError;
export function serviceTimeoutError(
  target?: string,
  timeoutMs?: number,
): TimeoutError;
export function serviceTimeoutError(
  first?: string | TimeoutFactoryOptions,
  second?: number,
): TimeoutError {
  const { timeoutMs, target } = resolveTimeoutArgs(first, second, "targetFirst");
  return new TimeoutError("The external service request timed out.", {
    code: ErrorCode.EXTERNAL_SERVICE_TIMEOUT,
    category: ErrorCategory.EXTERNAL_SERVICE,
    operation: TimeoutOperation.EXTERNAL_SERVICE,
    timeoutMs,
    target,
  });
}

/** Creates a lock acquisition timeout error. */
export function lockTimeoutError(
  options?: TimeoutFactoryOptions,
): TimeoutError;
export function lockTimeoutError(
  target?: string,
  timeoutMs?: number,
): TimeoutError;
export function lockTimeoutError(
  first?: string | TimeoutFactoryOptions,
  second?: number,
): TimeoutError {
  const { timeoutMs, target } = resolveTimeoutArgs(first, second, "targetFirst");
  return new TimeoutError("Timed out while waiting for a lock.", {
    code: ErrorCode.LOCK_TIMEOUT,
    category: ErrorCategory.CONFLICT,
    operation: TimeoutOperation.LOCK,
    timeoutMs,
    target,
    statusCode: 409,
  });
}
