/**
 * @zudojs/testing — Serialization assertions.
 *
 * Helpers for testing serialization round-trips and type preservation.
 */

import { JSONSerializer } from "@zudojs/serialization";

import { findDifference } from "../assertions/deepEqual.core.js";

const defaultSerializer = new JSONSerializer();

/**
 * Assert that a value round-trips through serialization correctly.
 *
 * @param value - The value to test.
 * @param options - Optional serializer and options.
 */
export function assertSerializesCorrectly<T>(
  value: T,
  options?: {
    readonly serializer?: JSONSerializer;
    readonly preserveTypes?: boolean;
  },
): void {
  const serializer = options?.serializer ?? defaultSerializer;
  const json = serializer.serialize(value, {
    preserveTypes: options?.preserveTypes,
  });
  const restored = serializer.deserialize<T>(json, {
    preserveTypes: options?.preserveTypes,
  });

  /*
   * Compared structurally, not by JSON string. `JSON.stringify` renders a Map
   * or a Set as `{}`, so a round trip that silently dropped one compared equal
   * to the original and this assertion passed — precisely the failure it exists
   * to catch.
   */
  const difference = findDifference(restored, value, "value");
  if (difference) {
    throw new Error(
      `Serialization round-trip failed at ${difference.path}: ${difference.reason}.`,
    );
  }
}

/**
 * Assert that a value serializes to the expected JSON string.
 */
export function assertSerializesTo<T>(
  value: T,
  expected: string,
  options?: {
    readonly serializer?: JSONSerializer;
    readonly preserveTypes?: boolean;
  },
): void {
  const serializer = options?.serializer ?? defaultSerializer;
  const actual = serializer.serialize(value, {
    preserveTypes: options?.preserveTypes,
  });

  if (actual !== expected) {
    throw new Error(`Expected serialized output ${expected}, got ${actual}`);
  }
}

/**
 * Assert that a JSON string deserializes to the expected value.
 */
export function assertDeserializesTo<T>(
  json: string,
  expected: T,
  options?: {
    readonly serializer?: JSONSerializer;
    readonly preserveTypes?: boolean;
  },
): void {
  const serializer = options?.serializer ?? defaultSerializer;
  const actual = serializer.deserialize<T>(json, {
    preserveTypes: options?.preserveTypes,
  });

  const difference = findDifference(actual, expected, "value");
  if (difference) {
    throw new Error(
      `Deserialized value mismatch at ${difference.path}: ${difference.reason}.`,
    );
  }
}

/**
 * Assert that type preservation round-trips correctly for a specific type.
 *
 * Useful for testing custom transformers.
 */
export function assertTypePreservesRoundTrip<T>(
  value: T,
  checker: (restored: T) => boolean,
  description: string,
): void {
  const serializer = new JSONSerializer();
  const json = serializer.serialize(value, { preserveTypes: true });
  const restored = serializer.deserialize<T>(json, { preserveTypes: true });

  if (!checker(restored)) {
    throw new Error(
      `Type preservation failed for ${description}: ${JSON.stringify(value)} → ${JSON.stringify(restored)}`,
    );
  }
}
