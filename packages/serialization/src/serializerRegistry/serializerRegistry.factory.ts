/**
 * @zudojs/serialization — Serializer factory.
 *
 * Factory function for creating serializer instances by format name.
 * Provides a clean public API for creating serializers without
 * exposing concrete class constructors.
 */

import type {
  Serializer,
  SerializationFormat,
  SerializeOptions,
  DeserializeOptions,
} from "../serializerTypes/index.js";
import { JSONSerializer } from "../serializerJson/index.js";
import { UnsupportedSerializationFormatError } from "@zudojs/errors";
import { SerializationFormat as Format } from "@zudojs/constants";
import { TransformerRegistry } from "../serializerTransforms/index.js";
import { SerializerRegistry } from "./serializerRegistry.core.js";

/**
 * Options accepted when creating a serializer.
 *
 * Every serialize/deserialize option (`pretty`, `preserveTypes`, `maxDepth`,
 * `maxSize`, `strict`, `allowUnsafeKeys`, ...) is accepted as a per-instance
 * default that each call can still override.
 */
export interface CreateSerializerOptions
  extends SerializeOptions, DeserializeOptions {
  /** Transformer registry to use instead of the built-in one. */
  readonly transformers?: TransformerRegistry;
  /** Pretty-print by default. Overridable per call. */
  readonly pretty?: boolean;
  /** Preserve special JS types by default. Overridable per call. */
  readonly preserveTypes?: boolean;
}

/**
 * Create a serializer for the given format.
 *
 * The `"json"` overload reports `Serializer<unknown, string>` rather than the
 * `string | Uint8Array` union. JSON output is always a string, and the union
 * made the result unusable with this package's own `serializeToEnvelope`,
 * which needs a string-producing serializer.
 *
 * @param format - The serialization format (e.g., "json").
 * @param options - Optional configuration for the serializer.
 * @returns A Serializer instance.
 * @throws {UnsupportedSerializationFormatError} when the format is not supported.
 */
export function createSerializer(
  format: typeof Format.JSON,
  options?: CreateSerializerOptions,
): Serializer<unknown, string>;
export function createSerializer(
  format: SerializationFormat,
  options?: CreateSerializerOptions,
): Serializer;
export function createSerializer(
  format: SerializationFormat,
  options?: CreateSerializerOptions,
): Serializer {
  switch (format) {
    case Format.JSON: {
      // Only `pretty` and `preserveTypes` used to be forwarded, so instance
      // limits such as `maxDepth`/`maxSize`/`strict` were silently dropped.
      const { transformers, ...rest } = options ?? {};
      const defaults = Object.fromEntries(
        Object.entries(rest).filter(([, value]) => value !== undefined),
      ) as SerializeOptions & DeserializeOptions;
      return new JSONSerializer({ transformers, defaults });
    }
    default:
      throw new UnsupportedSerializationFormatError(format);
  }
}

/**
 * Create a default serializer registry pre-populated with built-in serializers.
 *
 * @returns A SerializerRegistry with "json" registered.
 */
export function createDefaultRegistry(): SerializerRegistry {
  const registry = new SerializerRegistry();
  registry.register(createSerializer(Format.JSON));
  return registry;
}
