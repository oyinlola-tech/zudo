/**
 * Event emitter abort error helper for Zudojs.
 */

import type { Event } from "../eventTypes/eventDefinition.type.js";

import { EventDispatchAbortedError } from "../eventErrors/eventError.base.js";

import type { EventHandlerExecutionResult } from "./eventEmitter.type.js";

/**
 * Creates the error thrown when dispatch is aborted through an
 * AbortSignal. Partial results and errors gathered before the
 * abort are attached to the error.
 */
export function createAbortError(
  event?: Event,
  results: readonly EventHandlerExecutionResult[] = [],
  errors: readonly unknown[] = [],
): EventDispatchAbortedError {
  return new EventDispatchAbortedError("Event dispatch was aborted.", {
    eventType: event?.type,
    eventId: event?.id,
    results,
    errors,
  });
}

/**
 * Determines whether an error represents an aborted dispatch.
 */
export function isAbortError(error: unknown): boolean {
  return (
    error instanceof EventDispatchAbortedError ||
    (typeof error === "object" &&
      error !== null &&
      (error as { name?: unknown }).name === "AbortError")
  );
}
