/**
 * Error assertion helpers.
 *
 * Assert errors, error types, and error messages.
 */

import type { BaseError } from "@zudojs/errors";

import { findDifference } from "./deepEqual.core.js";
import { describeValue } from "./deepEqual.describe.js";

/**
 * Asserts that a function throws an error.
 *
 * @param fn - The function to call.
 * @param expectedMessage - Optional expected error message substring.
 * @returns The thrown error.
 */
export function assertThrows(
  fn: () => unknown,
  expectedMessage?: string,
): Error {
  let returned: unknown;

  try {
    returned = fn();
  } catch (error) {
    if (expectedMessage !== undefined) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes(expectedMessage)) {
        throw new Error(
          `Expected error message to contain "${expectedMessage}", got "${message}".`,
        );
      }
    }
    return error instanceof Error ? error : new Error(String(error));
  }

  if (isThenable(returned)) {
    // An async function never throws synchronously; its failure is a
    // rejection. Reporting "did not throw" was misleading, and the
    // rejected promise nobody awaited surfaced as an unhandled rejection
    // blamed on whichever test happened to be running.
    void returned.then(undefined, () => undefined);

    throw new Error(
      "assertThrows received a function that returned a promise; use assertRejects for async functions.",
    );
  }

  throw new Error("Expected function to throw, but it did not.");
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

/**
 * Asserts that an async function rejects.
 *
 * @param fn - The async function to call.
 * @param expectedMessage - Optional expected error message substring.
 * @returns The rejected error.
 */
export async function assertRejects(
  fn: () => Promise<unknown>,
  expectedMessage?: string,
): Promise<Error> {
  try {
    await fn();
  } catch (error) {
    if (expectedMessage !== undefined) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes(expectedMessage)) {
        throw new Error(
          `Expected error message to contain "${expectedMessage}", got "${message}".`,
        );
      }
    }
    return error instanceof Error ? error : new Error(String(error));
  }

  throw new Error("Expected function to reject, but it did not.");
}

/**
 * Asserts that an error is a BaseError with a specific code.
 *
 * @param error - The error to check.
 * @param code - Expected error code.
 */
export function assertErrorCode(error: unknown, code: string): void {
  if (!(error instanceof Error)) {
    throw new Error(
      `Expected error to be an Error instance, got ${typeof error}.`,
    );
  }

  const baseError = error as BaseError;

  if (baseError.code !== code) {
    throw new Error(`Expected error code "${code}", got "${baseError.code}".`);
  }
}

/**
 * Asserts that an error has specific metadata.
 *
 * @param error - The error to check.
 * @param key - Metadata key.
 * @param value - Expected metadata value.
 */
export function assertErrorMetadata(
  error: unknown,
  key: string,
  value: unknown,
): void {
  if (!(error instanceof Error)) {
    throw new Error(
      `Expected error to be an Error instance, got ${typeof error}.`,
    );
  }

  const baseError = error as BaseError;
  const actual = baseError.metadata?.[key];

  const difference = findDifference(actual, value, `metadata.${key}`);
  if (difference) {
    throw new Error(
      `Expected error metadata "${key}" to be ${describeValue(value)}, got ${describeValue(actual)}.`,
    );
  }
}

/**
 * Asserts that an error is an instance of a specific class.
 */
export function assertErrorType<T extends Error>(
  error: unknown,
  type: new (...args: never[]) => T,
): asserts error is T {
  if (!(error instanceof type)) {
    throw new Error(
      `Expected error to be a ${type.name}, got ${
        error instanceof Error ? error.constructor.name : typeof error
      }.`,
    );
  }
}
