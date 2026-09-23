/**
 * @zudojs/serialization — Low-level helpers shared by the JSON walkers.
 */

import { SCHEMA_FORBIDDEN_KEYS } from "@zudojs/constants";
import { SerializationPayloadTooLargeError } from "@zudojs/errors";

/** Byte length of a string, in whichever runtime we are on. */
export function byteLength(value: string): number {
  return typeof Buffer !== "undefined"
    ? Buffer.byteLength(value, "utf-8")
    : new TextEncoder().encode(value).byteLength;
}

/**
 * Error options for an oversized payload the server built itself (the
 * output of `serialize`): an internal error that is never shown to the
 * client. Oversized input to `deserialize` keeps the error's default, an
 * exposed 413.
 */
export const SERVER_BUILT_PAYLOAD_ERROR = Object.freeze({
  statusCode: 500,
  expose: false,
});

/**
 * Throws `SerializationPayloadTooLargeError` when a JSON string is larger
 * than `maxSize` bytes. `origin` says whose payload it is: `"input"`
 * (untrusted, an exposed 413) or `"output"` (server-built, an unexposed 500).
 */
export function assertByteSize(
  json: string,
  maxSize: number,
  origin: "input" | "output",
): void {
  const size = byteLength(json);
  if (size <= maxSize) return;
  throw origin === "output"
    ? new SerializationPayloadTooLargeError(size, maxSize, SERVER_BUILT_PAYLOAD_ERROR)
    : new SerializationPayloadTooLargeError(size, maxSize);
}

/**
 * Assigns a key onto a freshly built object without invoking a setter.
 *
 * Plain assignment of `__proto__` does not create an own property — it calls
 * the inherited setter and replaces the object's prototype, so an attacker's
 * keys resolve on the result while `Object.keys` shows nothing. `defineProperty`
 * always creates a real own property, and forbidden keys are dropped outright
 * unless the caller has explicitly opted in with `allowUnsafeKeys`.
 */
export function defineKey(
  target: Record<string, unknown>,
  key: string,
  value: unknown,
  allowUnsafeKeys: boolean,
): void {
  if (!allowUnsafeKeys && SCHEMA_FORBIDDEN_KEYS.has(key)) {
    return;
  }
  Object.defineProperty(target, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}
