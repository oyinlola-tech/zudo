/**
 * Depth- and redaction-aware serialization of BaseError cause chains.
 *
 * `BaseError.toJSON()` takes no arguments (it is called implicitly by
 * `JSON.stringify`), and subclasses override it as
 * `{ ...super.toJSON(), extra }`. To carry the chain depth and the redaction
 * mode through those overrides, the caller parks a frame here immediately
 * before invoking `toJSON()`, and `BaseError.toJSON` consumes it on entry.
 * Serialization is synchronous, so the frame cannot leak across calls.
 *
 * Internal to `@zudojs/errors`: not re-exported from the package barrel.
 *
 * @module base/core/baseError.serialize
 */

import { redactCauseValue } from "./errorCause.redact.js";

/**
 * Maximum depth of the cause chain included in serialized output, counted
 * across the WHOLE chain (BaseError and native causes alike).
 */
export const MAX_CAUSE_DEPTH = 8;

/** How a `toJSON()` call should serialize. */
export interface SerializationFrame {
  /** Depth of the error being serialized; the outermost error is 0. */
  readonly depth: number;
  /** Whether metadata, issues and object causes are redacted. */
  readonly redact: boolean;
}

const DEFAULT_FRAME: SerializationFrame = Object.freeze({
  depth: 0,
  redact: true,
});

let pendingFrame: SerializationFrame | undefined;

/** Errors currently being serialized (guards against cyclic cause chains). */
const serializing = new WeakSet<object>();

/** Serialized objects genuinely produced by a BaseError's `toJSON`. */
const producedByBaseError = new WeakSet<object>();

/** Structural shape of a BaseError, recognised by its `toJSON`. */
interface JsonableError extends Error {
  toJSON(): object;
}

/** Consumes the frame parked for the current `toJSON()` call. */
export function takeSerializationFrame(): SerializationFrame {
  const frame = pendingFrame ?? DEFAULT_FRAME;
  pendingFrame = undefined;
  return frame;
}

/** Marks an error as in-progress for cycle detection; returns a release. */
export function beginSerializing(error: object): (() => void) | undefined {
  if (serializing.has(error)) return undefined;
  serializing.add(error);
  return () => serializing.delete(error);
}

/**
 * Calls `error.toJSON()` with an explicit frame and records the result as a
 * genuine serialized BaseError.
 */
export function toJSONWithFrame(
  error: JsonableError,
  frame: SerializationFrame,
): Record<string, unknown> {
  pendingFrame = frame;
  try {
    const result = error.toJSON() as Record<string, unknown>;
    producedByBaseError.add(result);
    return result;
  } finally {
    pendingFrame = undefined;
  }
}

/**
 * Whether `value` came from a BaseError's `toJSON` via this module, as
 * opposed to an arbitrary object that merely has the same field names.
 */
export function isGenuineSerializedBaseError(value: object): boolean {
  return producedByBaseError.has(value);
}

function isBaseErrorLike(value: unknown, brand: symbol): value is JsonableError {
  return (
    value instanceof Error &&
    (value as unknown as Record<symbol, unknown>)[brand] === true &&
    typeof (value as Partial<JsonableError>).toJSON === "function"
  );
}

/**
 * Serializes one cause at `depth`, carrying the depth into BaseError causes
 * so the limit applies across the whole chain. Recursion is bounded by
 * {@link MAX_CAUSE_DEPTH}, so even a 20 000-deep chain cannot overflow the
 * stack.
 */
export function serializeCauseAt(
  cause: unknown,
  depth: number,
  redact: boolean,
  brand: symbol,
): unknown {
  if (depth > MAX_CAUSE_DEPTH) return "[MaxDepth]";

  if (isBaseErrorLike(cause, brand)) {
    if (serializing.has(cause)) return "[Circular]";
    return toJSONWithFrame(cause, { depth, redact });
  }

  if (cause instanceof Error) {
    const release = beginSerializing(cause);
    if (release === undefined) return "[Circular]";
    try {
      return {
        name: cause.name,
        message: cause.message,
        ...(cause.stack ? { stack: cause.stack } : {}),
        ...(cause.cause !== undefined
          ? { cause: serializeCauseAt(cause.cause, depth + 1, redact, brand) }
          : {}),
      };
    } finally {
      release();
    }
  }

  if (cause !== null && typeof cause === "object") {
    if (serializing.has(cause)) return "[Circular]";
    return redact ? redactCauseValue(cause, undefined) : cause;
  }

  return cause;
}
