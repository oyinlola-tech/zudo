/**
 * @zudojs/rpc/reliability/deadline
 *
 * Deadline utilities for RPC operations.
 */

import { RPCDeadlineExceededError } from "../../errors/rpc.errors.js";

/**
 * Calculates the remaining time until a deadline.
 */
export function getRemainingTime(deadline: number): number {
  const remaining = deadline - Date.now();
  return Math.max(0, remaining);
}

/**
 * Checks if a deadline has been exceeded.
 */
export function isDeadlineExceeded(deadline: number): boolean {
  return Date.now() >= deadline;
}

/**
 * Throws if the deadline has been exceeded.
 *
 * Throws the typed `RPCDeadlineExceededError` so callers and the server's
 * error mapping can recognise it, rather than a bare `Error`.
 */
export function throwIfDeadlineExceeded(
  deadline: number,
  procedureName?: string,
): void {
  if (isDeadlineExceeded(deadline)) {
    throw new RPCDeadlineExceededError(deadline, procedureName);
  }
}

/**
 * Reads a deadline from request metadata.
 *
 * Returns `undefined` when absent or not a usable epoch milliseconds
 * value, so a malformed deadline is ignored rather than treated as
 * already expired.
 */
export function readDeadline(metadata: {
  readonly deadline?: unknown;
}): number | undefined {
  const deadline = metadata.deadline;

  if (typeof deadline !== "number" || !Number.isFinite(deadline)) {
    return undefined;
  }

  if (deadline <= 0) {
    return undefined;
  }

  return deadline;
}
