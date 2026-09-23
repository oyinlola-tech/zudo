/**
 * @zudojs/queue — Serializer
 *
 * Job payload serialization using @zudojs/serialization's JSONSerializer.
 *
 * The default preserves types. Plain JSON turned a `Date` into a string
 * while `Queue<{ d: Date }>` still typed it as a `Date`, so a processor
 * calling `job.data.d.getTime()` crashed; `BigInt` was rejected outright.
 * With `preserveTypes`, `Date`, `BigInt`, `Map`, `Set`, `Uint8Array` and
 * `Error` all come back as themselves, and output for plain JSON data is
 * unchanged.
 */

import { JSONSerializer } from "@zudojs/serialization";

import type { Serializer } from "./serializer.type.js";

const inner = new JSONSerializer();

/**
 * Default serializer: JSON that round-trips `Date`, `BigInt`, `Map`, `Set`,
 * `Uint8Array` and `Error`, backed by @zudojs/serialization.
 */
export const JsonSerializer: Serializer = Object.freeze({
  serialize<T>(data: T): string {
    return inner.serialize(data, { preserveTypes: true });
  },

  deserialize<T>(data: string): T {
    return inner.deserialize<T>(data, { preserveTypes: true });
  },
});

/**
 * Creates a JSON serializer with custom options.
 */
export function createJsonSerializer(options?: {
  /** Indentation width. Any value turns on pretty-printing. */
  space?: number;
  /**
   * Preserve BigInt, Date, Map, Set, Uint8Array and Error across the round
   * trip. Defaults to `true`, like `JsonSerializer`. With `false` a `Date`
   * comes back as its ISO string, so type such payload fields as `string`.
   */
  preserveTypes?: boolean;
}): Serializer {
  const preserveTypes = options?.preserveTypes ?? true;
  return Object.freeze({
    serialize<T>(data: T): string {
      return inner.serialize(data, {
        pretty: options?.space !== undefined,
        preserveTypes,
        indent: options?.space,
      });
    },

    deserialize<T>(data: string): T {
      return inner.deserialize<T>(data, { preserveTypes });
    },
  });
}

/**
 * Serializer that keeps payloads as they are.
 *
 * It sets `passthrough`, so the in-memory queue stores payloads by reference
 * (class instances, functions and all) instead of round-tripping them. Used
 * standalone it must still honour the `Serializer` contract of producing a
 * string: a string is returned untouched, anything else is JSON-encoded, and
 * `deserialize` parses JSON where it can and returns the raw string where it
 * cannot.
 */
export const PassthroughSerializer: Serializer = Object.freeze({
  passthrough: true,

  serialize<T>(data: T): string {
    if (typeof data === "string") {
      return data;
    }
    return inner.serialize(data);
  },

  deserialize<T>(data: string): T {
    try {
      return inner.deserialize<T>(data);
    } catch {
      return data as T;
    }
  },
});
