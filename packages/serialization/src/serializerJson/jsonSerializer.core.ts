/**
 * JSON serializer with optional type preservation.
 *
 * Fast path (default): delegates to native JSON.stringify/parse.
 * Advanced path (preserveTypes: true): recursive traversal with
 * transformer-based type preservation.
 */

import type {
  Serializer,
  SerializeOptions,
  DeserializeOptions,
} from "../serializerTypes/index.js";
import { TransformerRegistry } from "../serializerTransforms/index.js";
import {
  DateTransformer,
  BigIntTransformer,
  MapTransformer,
  SetTransformer,
} from "../serializerTransforms/index.js";
import {
  BufferTransformer,
  ErrorTransformer,
} from "../serializerTransformsExt/index.js";
import {
  SerializationLimits,
  SerializationTags,
  SCHEMA_FORBIDDEN_KEYS,
} from "@zudojs/constants";
import { isPlainObject } from "@zudojs/types";
import {
  assertNoCircularReference,
  assertDepthWithinLimit,
} from "@zudojs/validation";

/** Default transformer registry with all built-in transformers. */
function createDefaultTransformers(): TransformerRegistry {
  const registry = new TransformerRegistry();
  registry.register(DateTransformer);
  registry.register(BigIntTransformer);
  registry.register(MapTransformer);
  registry.register(SetTransformer);
  registry.register(BufferTransformer);
  registry.register(ErrorTransformer);
  return registry;
}

export class JSONSerializer implements Serializer<unknown, string> {
  public readonly name = "json";
  public readonly contentType = "application/json";

  private readonly transformers: TransformerRegistry;
  private readonly defaults: SerializeOptions & DeserializeOptions;

  constructor(options?: {
    readonly transformers?: TransformerRegistry;
    /** Default options merged into every call. */
    readonly defaults?: SerializeOptions & DeserializeOptions;
  }) {
    this.transformers = options?.transformers ?? createDefaultTransformers();
    this.defaults = options?.defaults ?? {};
  }

  /** Register a custom type transformer. */
  registerTransformer(
    transformer: import("../serializerTypes/index.js").TypeTransformer,
  ): void {
    this.transformers.register(transformer);
  }

  serialize(value: unknown, options?: SerializeOptions): string {
    const opts = { ...this.defaults, ...options };
    const maxDepth = opts.maxDepth ?? SerializationLimits.MAX_DEPTH;
    const maxSize = opts.maxSize ?? SerializationLimits.MAX_SIZE;

    if (opts.preserveTypes === true) {
      assertNoCircularReference(value);
      assertDepthWithinLimit(value, maxDepth);
      const transformed = this.transformValue(value, 0, maxDepth, opts);
      const json = opts.pretty
        ? JSON.stringify(transformed, null, opts.indent ?? 2)
        : JSON.stringify(transformed);
      this.assertOutputSize(json, maxSize);
      return json;
    }

    // The fast path stays a bare `JSON.stringify` by default, but a depth
    // limit the caller asked for must still be enforced: `maxDepth` used to
    // be read only when `preserveTypes` was on, so a per-call or per-instance
    // limit was silently ignored on the path most callers use.
    if (opts.maxDepth !== undefined) {
      assertDepthWithinLimit(value, maxDepth);
    }

    const json = opts.pretty
      ? JSON.stringify(value, null, opts.indent ?? 2)
      : JSON.stringify(value);
    this.assertOutputSize(json, maxSize);
    return json;
  }

  deserialize<T = unknown>(value: string, options?: DeserializeOptions): T {
    const opts = { ...this.defaults, ...options };

    // Bound the input before parsing. `maxSize` used to apply on the way out
    // only, which is the wrong direction: serialized output is ours, whereas
    // the string handed to `deserialize` arrives from a queue, an RPC peer, or
    // a request body.
    const maxSize = opts.maxSize ?? SerializationLimits.MAX_SIZE;
    this.assertInputSize(value, maxSize);

    if (opts.strict === true) this.assertValidJson(value);

    const parsed: unknown = JSON.parse(value);

    if (opts.preserveTypes === true) {
      const maxDepth = opts.maxDepth ?? SerializationLimits.MAX_DEPTH;
      assertDepthWithinLimit(parsed, maxDepth);
      return this.restoreValue(parsed, 0, maxDepth, opts) as T;
    }

    // Same contract on the fast path: an explicit `maxDepth` bounds input
    // that arrives from the wire, whether or not types are being restored.
    if (opts.maxDepth !== undefined) {
      assertDepthWithinLimit(parsed, opts.maxDepth);
    }

    return parsed as T;
  }

  private transformValue(
    value: unknown,
    depth: number,
    maxDepth: number,
    options: SerializeOptions,
  ): unknown {
    if (value === null || value === undefined) return value;
    if (typeof value === "bigint") {
      const transformer = this.transformers.findForValue(value);
      return transformer
        ? transformer.serialize(value, options)
        : value.toString();
    }
    if (typeof value !== "object") return value;
    if (depth >= maxDepth) {
      // Depth is pre-checked by assertDepthWithinLimit, so this is a belt-and
      // braces guard. Returning the raw value would silently emit an untagged
      // Map or Date, which cannot round-trip — fail loudly instead.
      throw new Error(`Serialization exceeded maximum depth of ${maxDepth}`);
    }

    if (Array.isArray(value)) {
      return value.map((item) =>
        this.transformValue(item, depth + 1, maxDepth, options),
      );
    }

    const transformer = this.transformers.findForValue(value);
    if (transformer) {
      const raw = transformer.serialize(value, options);
      return this.transformValue(raw, depth + 1, maxDepth, options);
    }

    if (isPlainObject(value)) {
      const result: Record<string, unknown> = {};
      for (const key of Object.keys(value)) {
        defineKey(
          result,
          key,
          this.transformValue(
            (value as Record<string, unknown>)[key],
            depth + 1,
            maxDepth,
            options,
          ),
          options.allowUnsafeKeys === true,
        );
      }
      return result;
    }

    return value;
  }

  private restoreValue(
    value: unknown,
    depth: number,
    maxDepth: number,
    options: DeserializeOptions,
  ): unknown {
    if (value === null || value === undefined) return value;
    if (typeof value !== "object") return value;
    if (depth >= maxDepth) {
      throw new Error(`Deserialization exceeded maximum depth of ${maxDepth}`);
    }

    if (Array.isArray(value)) {
      return value.map((item) =>
        this.restoreValue(item, depth + 1, maxDepth, options),
      );
    }

    const obj = value as Record<string, unknown>;
    const typeTag = obj[SerializationTags.TYPE];

    if (typeof typeTag === "string" && this.transformers.has(typeTag)) {
      // Restore the children first. A transformer receives a plain structure
      // and has no way to recurse back into this serializer, so handing it the
      // still-tagged payload is what used to leave a Map full of raw
      // `{$type, $value}` objects.
      const restoredShell: Record<string, unknown> = {};
      for (const key of Object.keys(obj)) {
        defineKey(
          restoredShell,
          key,
          key === SerializationTags.TYPE
            ? obj[key]
            : this.restoreValue(obj[key], depth + 1, maxDepth, options),
          options.allowUnsafeKeys === true,
        );
      }
      return this.transformers.get(typeTag).deserialize(restoredShell, options);
    }

    // An unknown tag is ordinary data. Throwing here let any peer crash the
    // consumer with `{"$type":"anything"}`, and made legitimate payloads that
    // happen to carry a `$type` field unparseable.
    if (typeof typeTag === "string" && options.strict === true) {
      throw new Error(
        `Unknown serialization type tag: "${typeTag}". ` +
          "Register a transformer for it, or deserialize without strict mode.",
      );
    }

    if (isPlainObject(value)) {
      const result: Record<string, unknown> = {};
      for (const key of Object.keys(value)) {
        defineKey(
          result,
          key,
          this.restoreValue(
            (value as Record<string, unknown>)[key],
            depth + 1,
            maxDepth,
            options,
          ),
          options.allowUnsafeKeys === true,
        );
      }
      return result;
    }

    return value;
  }

  private assertValidJson(value: string): void {
    try {
      JSON.parse(value);
    } catch (err) {
      throw new Error(`Invalid JSON: ${(err as Error).message}`);
    }
  }

  private assertOutputSize(json: string, maxSize: number): void {
    const size = byteLength(json);
    if (size > maxSize) {
      throw new Error(
        `Serialized payload too large: ${size} bytes (max: ${maxSize})`,
      );
    }
  }

  private assertInputSize(json: string, maxSize: number): void {
    const size = byteLength(json);
    if (size > maxSize) {
      throw new Error(
        `Serialized payload too large: ${size} bytes (max: ${maxSize})`,
      );
    }
  }
}

/** Byte length of a string, in whichever runtime we are on. */
function byteLength(value: string): number {
  return typeof Buffer !== "undefined"
    ? Buffer.byteLength(value, "utf-8")
    : new TextEncoder().encode(value).byteLength;
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
function defineKey(
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
