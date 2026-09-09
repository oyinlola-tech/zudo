/**
 * @zudojs/serialization
 *
 * Data translation layer for the Zudojs framework.
 *
 * Provides JSON serialization with type preservation, a transformer
 * system for custom types, serialization envelopes for cross-service
 * communication, and a registry for managing multiple serializers.
 *
 * @example
 * ```typescript
 * import { createSerializer, JSONSerializer } from "@zudojs/serialization";
 *
 * // Fast path (default) — nearly zero overhead over native JSON
 * const serializer = createSerializer("json");
 * const json = serializer.serialize({ hello: "world" });
 * const data = serializer.deserialize(json);
 *
 * // Advanced path — type preservation for Date, BigInt, Map, Set, etc.
 * const advanced = new JSONSerializer();
 * const result = advanced.serialize(
 *   { createdAt: new Date(), amount: 100n },
 *   { preserveTypes: true },
 * );
 * ```
 */

// ─── Types ────────────────────────────────────────────────────
export type {
  SerializationFormat,
  SerializedValue,
  SerializeOptions,
  DeserializeOptions,
  SerializationMetadata,
  SerializedEnvelope,
  Serializer,
  TypeTransformer,
} from "./serializerTypes/index.js";

// ─── JSON Serializer ──────────────────────────────────────────
export { JSONSerializer } from "./serializerJson/index.js";

// ─── Transformer Registry ─────────────────────────────────────
export { TransformerRegistry } from "./serializerTransforms/index.js";
export { DateTransformer } from "./serializerTransforms/index.js";
export { BigIntTransformer } from "./serializerTransforms/index.js";
export { MapTransformer } from "./serializerTransforms/index.js";
export { SetTransformer } from "./serializerTransforms/index.js";

// ─── Extended Transformers ────────────────────────────────────
export { BufferTransformer } from "./serializerTransformsExt/index.js";
export { ErrorTransformer } from "./serializerTransformsExt/index.js";
export {
  toBase64,
  fromBase64,
  encodeUtf8,
  decodeUtf8,
} from "./serializerTransformsExt/index.js";

// ─── Envelope ─────────────────────────────────────────────────
export {
  createEnvelope,
  assertValidEnvelope,
  contentTypeForFormat,
  unwrapEnvelope,
  serializeToEnvelope,
  deserializeFromEnvelope,
} from "./serializerEnvelope/index.js";

// ─── Registry & Factory ───────────────────────────────────────
export { SerializerRegistry } from "./serializerRegistry/index.js";
export {
  createSerializer,
  createDefaultRegistry,
} from "./serializerRegistry/index.js";
export type { CreateSerializerOptions } from "./serializerRegistry/index.js";
