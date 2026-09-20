/**
 * @zudojs/serialization — Transformer registry.
 *
 * Manages type transformers that handle custom JS types during
 * serialization and deserialization. Keyed by type tag string.
 */

import type { TypeTransformer } from "../serializerTypes/index.js";
import { TransformerError, TransformerNotFoundError } from "@zudojs/errors";
import { SerializationLimits } from "@zudojs/constants";

/**
 * Registry of type transformers keyed by their type tag.
 *
 * Transformers handle round-trip serialization of special JS types
 * (Date, BigInt, Map, Set, etc.) through tagged JSON representations.
 */
export class TransformerRegistry {
  private readonly transformers = new Map<string, TypeTransformer>();

  /**
   * Register a transformer.
   *
   * @throws {TransformerError} when the registry is already full.
   */
  register(transformer: TypeTransformer): void {
    if (this.transformers.size >= SerializationLimits.MAX_TRANSFORMERS) {
      throw new TransformerError(
        transformer.type,
        `Maximum transformer limit (${SerializationLimits.MAX_TRANSFORMERS}) reached.`,
      );
    }
    this.transformers.set(transformer.type, transformer);
  }

  /** Unregister a transformer by type tag. */
  unregister(type: string): boolean {
    return this.transformers.delete(type);
  }

  /** Retrieve a transformer by type tag. */
  get(type: string): TypeTransformer {
    const transformer = this.transformers.get(type);
    if (!transformer) throw new TransformerNotFoundError(type);
    return transformer;
  }

  /** Find a transformer that can serialize the given value. */
  findForValue(value: unknown): TypeTransformer | undefined {
    for (const transformer of this.transformers.values()) {
      if (transformer.canSerialize(value)) return transformer;
    }
    return undefined;
  }

  /** Returns true when a transformer is registered for the type tag. */
  has(type: string): boolean {
    return this.transformers.has(type);
  }

  /** Returns all registered type tags. */
  types(): string[] {
    return [...this.transformers.keys()];
  }

  /** Remove all registered transformers. */
  clear(): void {
    this.transformers.clear();
  }

  /** Number of registered transformers. */
  get size(): number {
    return this.transformers.size;
  }
}
