/**
 * @zudojs/serialization — Transformer output and lossy-value checks.
 */

import { SerializationTags } from "@zudojs/constants";
import { SerializeError } from "@zudojs/errors";
import { isPlainObject } from "@zudojs/types";
import type { TypeTransformer } from "../serializerTypes/index.js";

/**
 * Normalises what a transformer's `serialize` returned into the tagged
 * `{ $type, $value }` form that is written to the wire.
 *
 * A transformer may return the full tagged object (the built-ins do; any
 * plain object with its own string `$type` is taken as-is), or just the
 * value to store, which is wrapped as `{ $type: transformer.type, $value }`.
 * Before, a bare return was written untagged and could never be revived.
 */
export function toTaggedOutput(
  transformer: TypeTransformer,
  raw: unknown,
): Record<string, unknown> {
  if (
    isPlainObject(raw) &&
    Object.hasOwn(raw, SerializationTags.TYPE) &&
    typeof raw[SerializationTags.TYPE] === "string"
  ) {
    return raw;
  }
  return {
    [SerializationTags.TYPE]: transformer.type,
    [SerializationTags.VALUE]: raw,
  };
}

/** Built-in objects whose JSON form silently drops their contents. */
const LOSSY_TYPES: ReadonlyArray<readonly [string, (value: object) => boolean]> = [
  ["Map", (value) => value instanceof Map],
  ["Set", (value) => value instanceof Set],
  ["WeakMap", (value) => value instanceof WeakMap],
  ["WeakSet", (value) => value instanceof WeakSet],
  ["WeakRef", (value) => value instanceof WeakRef],
  ["Promise", (value) => value instanceof Promise],
  ["RegExp", (value) => value instanceof RegExp],
  ["Error", (value) => value instanceof Error],
  ["ArrayBuffer", (value) => value instanceof ArrayBuffer],
  ["DataView", (value) => value instanceof DataView],
];

/**
 * Throws when a value that no transformer handles would be written as `{}`
 * (a `Map`, `Set`, `Error`, `RegExp`, ...), instead of silently losing its
 * contents. Only reachable when the built-in transformers are disabled or
 * a type has no transformer.
 *
 * @throws {SerializeError} naming the type and how to fix it.
 */
export function assertNotLossy(value: object): void {
  for (const [name, matches] of LOSSY_TYPES) {
    if (matches(value)) {
      throw new SerializeError(
        `Cannot serialize a ${name} with preserveTypes: no transformer is ` +
          `registered for it, and JSON would write it as {} and lose its ` +
          `contents. Register a transformer for ${name}, or keep the ` +
          `built-in transformers enabled (do not pass builtins: false).`,
        { format: "json" },
      );
    }
  }
}
