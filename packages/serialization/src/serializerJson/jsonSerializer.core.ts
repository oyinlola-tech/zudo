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
  createBuiltinTransformers,
  layerTransformers,
  type TransformerLookup,
} from "../serializerTransformPolicy/index.js";
import { SerializationLimits } from "@zudojs/constants";
import { InvalidSerializedDataError, TransformerError } from "@zudojs/errors";
import {
  assertNoCircularReference,
  assertDepthWithinLimit,
} from "@zudojs/validation";
import { ESCAPED_OBJECT_TAG } from "./jsonSerializer.escape.js";
import { assertByteSize } from "./jsonSerializer.keys.js";
import { transformValue } from "./jsonSerializer.transform.js";
import { restoreValue } from "./jsonSerializer.restore.js";

/** Options accepted by the {@link JSONSerializer} constructor. */
export interface JSONSerializerOptions {
  /**
   * Your transformers. They are consulted first; the built-in transformers
   * (`Date`, `BigInt`, `Map`, `Set`, `Uint8Array`/`Buffer`, `Error`) still
   * handle every type your registry does not, unless `builtins` is `false`.
   * Transformers registered on it later are picked up.
   */
  readonly transformers?: TransformerRegistry;
  /**
   * Include the built-in transformers behind `transformers` (default
   * `true`). With `false` only your registry is used, and a value no
   * transformer handles that JSON would write as `{}` (a `Map`, `Set`,
   * `Error`, ...) throws `SerializeError` under `preserveTypes`.
   */
  readonly builtins?: boolean;
  /** Default options merged into every call. */
  readonly defaults?: SerializeOptions & DeserializeOptions;
}

/**
 * JSON serializer. With `preserveTypes`, plain objects that carry their own
 * string `$type` key are escaped as `{"$type":"Object","$value":{...}}` on
 * write and unwrapped on read, so user data can never be revived as a
 * different runtime type.
 */
export class JSONSerializer implements Serializer<unknown, string> {
  public readonly name = "json";
  public readonly contentType = "application/json";

  private readonly registry: TransformerRegistry;
  private readonly transformers: TransformerLookup;
  private readonly defaults: SerializeOptions & DeserializeOptions;

  constructor(options?: JSONSerializerOptions) {
    const builtins = options?.builtins !== false;
    const custom = options?.transformers;
    this.registry =
      custom ?? (builtins ? createBuiltinTransformers() : new TransformerRegistry());
    this.transformers =
      custom && builtins
        ? layerTransformers(custom, createBuiltinTransformers())
        : this.registry;
    this.defaults = options?.defaults ?? {};
  }

  /**
   * Register a custom type transformer.
   *
   * @throws {TransformerError} for the reserved escape tag `"Object"`.
   */
  registerTransformer(
    transformer: import("../serializerTypes/index.js").TypeTransformer,
  ): void {
    if (transformer.type === ESCAPED_OBJECT_TAG) {
      throw new TransformerError(
        transformer.type,
        `"${ESCAPED_OBJECT_TAG}" is reserved for escaped plain objects.`,
      );
    }
    this.registry.register(transformer);
  }

  serialize(value: unknown, options?: SerializeOptions): string {
    const opts = { ...this.defaults, ...options };
    const maxDepth = opts.maxDepth ?? SerializationLimits.MAX_DEPTH;
    const maxSize = opts.maxSize ?? SerializationLimits.MAX_SIZE;

    if (opts.preserveTypes === true) {
      // The cycle check runs first and must therefore honour the caller's
      // depth limit: with its own 512-level ceiling it halted on a deep but
      // perfectly acyclic payload and reported a cycle that did not exist,
      // disagreeing with the fast path below for the same input.
      assertNoCircularReference(value, "root", maxDepth);
      assertDepthWithinLimit(value, maxDepth);
      const transformed = transformValue(
        { transformers: this.transformers, maxDepth, options: opts },
        value,
        0,
      );
      const json = opts.pretty
        ? JSON.stringify(transformed, null, opts.indent ?? 2)
        : JSON.stringify(transformed);
      assertByteSize(json, maxSize);
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
    assertByteSize(json, maxSize);
    return json;
  }

  deserialize<T = unknown>(value: string, options?: DeserializeOptions): T {
    const opts = { ...this.defaults, ...options };

    // Bound the input before parsing. `maxSize` used to apply on the way out
    // only, which is the wrong direction: serialized output is ours, whereas
    // the string handed to `deserialize` arrives from a queue, an RPC peer, or
    // a request body.
    const maxSize = opts.maxSize ?? SerializationLimits.MAX_SIZE;
    assertByteSize(value, maxSize);

    const parsed = this.parse(value);

    if (opts.preserveTypes === true) {
      const maxDepth = opts.maxDepth ?? SerializationLimits.MAX_DEPTH;
      assertDepthWithinLimit(parsed, maxDepth);
      return restoreValue(
        { transformers: this.transformers, maxDepth, options: opts },
        parsed,
        0,
      ) as T;
    }

    // Same contract on the fast path: an explicit `maxDepth` bounds input
    // that arrives from the wire, whether or not types are being restored.
    if (opts.maxDepth !== undefined) {
      assertDepthWithinLimit(parsed, opts.maxDepth);
    }

    return parsed as T;
  }

  /** Parses JSON, reporting malformed input as a typed error. */
  private parse(value: string): unknown {
    try {
      return JSON.parse(value) as unknown;
    } catch (err) {
      throw new InvalidSerializedDataError(
        `Invalid JSON: ${(err as Error).message}`,
        { format: "json", cause: err },
      );
    }
  }
}
