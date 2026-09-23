/**
 * @zudojs/serialization — Transformer lookup.
 *
 * The serializer resolves transformers through a lookup rather than a single
 * registry, so a caller-supplied registry can sit in front of the built-ins
 * instead of replacing them.
 */

import type { TypeTransformer } from "../serializerTypes/index.js";
import {
  BigIntTransformer,
  DateTransformer,
  MapTransformer,
  SetTransformer,
  TransformerRegistry,
} from "../serializerTransforms/index.js";
import {
  BufferTransformer,
  ErrorTransformer,
} from "../serializerTransformsExt/index.js";

/** The read side of a transformer registry, as the walkers use it. */
export interface TransformerLookup {
  /** Find a transformer that can serialize the given value. */
  findForValue(value: unknown): TypeTransformer | undefined;
  /** Returns true when a transformer is registered for the type tag. */
  has(type: string): boolean;
  /** Retrieve a transformer by type tag (throws when absent). */
  get(type: string): TypeTransformer;
}

/**
 * Creates a registry holding every built-in transformer: `Date`, `BigInt`,
 * `Map`, `Set`, `Uint8Array`/`Buffer` and `Error`.
 */
export function createBuiltinTransformers(): TransformerRegistry {
  const registry = new TransformerRegistry();
  registry.register(DateTransformer);
  registry.register(BigIntTransformer);
  registry.register(MapTransformer);
  registry.register(SetTransformer);
  registry.register(BufferTransformer);
  registry.register(ErrorTransformer);
  return registry;
}

/**
 * Layers `primary` over `fallback`: every lookup consults `primary` first,
 * so a caller's transformer for a tag or a value wins over the built-in
 * one. `primary` is read live, so transformers registered on it later are
 * seen too.
 */
export function layerTransformers(
  primary: TransformerLookup,
  fallback: TransformerLookup,
): TransformerLookup {
  return {
    findForValue: (value) =>
      primary.findForValue(value) ?? fallback.findForValue(value),
    has: (type) => primary.has(type) || fallback.has(type),
    get: (type) => (primary.has(type) ? primary.get(type) : fallback.get(type)),
  };
}
