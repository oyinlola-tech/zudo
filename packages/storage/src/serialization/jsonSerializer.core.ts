/**
 * @zudojs/storage — JSON Serializer
 *
 * Serializes/deserializes data for storage with support for BigInt, Date,
 * Map, Set, and Uint8Array via @zudojs/serialization's type preservation.
 */

import { StorageError } from "@zudojs/errors";
import type { Serializer, SerializationFormat } from "../types/storage.type.js";
import { JSONSerializer } from "@zudojs/serialization";

/**
 * Refuse a format this serializer does not implement.
 *
 * The `Serializer` contract admits `msgpack` and `binary`, and silently
 * producing JSON for either would hand the caller bytes it cannot decode
 * with the codec it asked for.
 */
function assertJsonFormat(format: SerializationFormat | undefined): void {
  if (format === undefined || format === "json") return;

  throw new StorageError(
    `JsonSerializer cannot handle the "${format}" format; it supports "json" only. Supply a serializer that implements "${format}", or omit the format argument.`,
    { code: "STORAGE_UNSUPPORTED_SERIALIZATION_FORMAT", statusCode: 400 },
  );
}

/**
 * JSON serializer with extended type support for storage operations.
 *
 * Delegates to @zudojs/serialization's JSONSerializer for type preservation
 * (BigInt, Date, Map, Set, Uint8Array) and wraps the output as Uint8Array
 * to satisfy the storage Serializer contract.
 */
export class JsonSerializer implements Serializer {
  private readonly inner: JSONSerializer;

  constructor() {
    this.inner = new JSONSerializer();
  }

  serialize<T>(value: T, format?: SerializationFormat): Uint8Array {
    assertJsonFormat(format);
    const json = this.inner.serialize(value, { preserveTypes: true });
    return new TextEncoder().encode(json);
  }

  deserialize<T>(data: Uint8Array, format?: SerializationFormat): T {
    assertJsonFormat(format);
    const json = new TextDecoder().decode(data);
    return this.inner.deserialize<T>(json, { preserveTypes: true });
  }
}
