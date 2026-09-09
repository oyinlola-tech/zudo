/**
 * @zudojs/serialization — Core type definitions.
 *
 * Defines the contracts that all serialization implementations
 * must satisfy. These types are serialization-specific and are
 * NOT available in @zudojs/types or @zudojs/constants.
 */

/** Supported serialization format identifiers. */
export type SerializationFormat =
  "json" | "text" | "binary" | "messagepack" | string;

/** The output of a serialization operation. */
export type SerializedValue = string | Uint8Array;

/** Options for serialization operations. */
export interface SerializeOptions {
  /** Pretty-print the output (JSON only). */
  readonly pretty?: boolean;
  /** Preserve special JS types (Date, BigInt, Map, Set, etc.). */
  readonly preserveTypes?: boolean;
  /** Maximum object depth before throwing. */
  readonly maxDepth?: number;
  /** Maximum serialized size in bytes. */
  readonly maxSize?: number;
  /** Indentation for pretty-print (default: 2). */
  readonly indent?: number;
  /**
   * Include `Error.stack` when serializing errors (default: false).
   *
   * A stack names absolute file paths and internal call structure. Serialized
   * errors travel to queues, RPC peers and log sinks, so stacks are opt-in.
   */
  readonly includeStack?: boolean;
  /**
   * Permit `__proto__`, `constructor` and `prototype` as data keys
   * (default: false). See {@link DeserializeOptions.allowUnsafeKeys}.
   */
  readonly allowUnsafeKeys?: boolean;
}

/** Options for deserialization operations. */
export interface DeserializeOptions {
  /** Restore special JS types from tagged representations. */
  readonly preserveTypes?: boolean;
  /** Maximum object depth before throwing. */
  readonly maxDepth?: number;
  /**
   * Throw on malformed or unexpected data.
   *
   * Also makes an unrecognised `$type` tag an error rather than treating the
   * object as ordinary data.
   */
  readonly strict?: boolean;
  /**
   * Allow prototype-polluting keys during reconstruction (default: false).
   *
   * With this off — the default — `__proto__`, `constructor` and `prototype`
   * are dropped from reconstructed objects. Turning it on reinstates them as
   * real own properties (never as a prototype assignment), which is only safe
   * when the payload is trusted.
   */
  readonly allowUnsafeKeys?: boolean;
  /** Maximum accepted input size in bytes. */
  readonly maxSize?: number;
}

/** Metadata attached to serialized output. */
export interface SerializationMetadata {
  /** The format used (e.g., "json"). */
  readonly format: string;
  /** Schema version for forward/backward compatibility. */
  readonly version?: number;
  /** MIME content type (e.g., "application/json"). */
  readonly contentType?: string;
  /** Character encoding (e.g., "utf-8"). */
  readonly encoding?: string;
}

/** An envelope wrapping serialized data with metadata. */
export interface SerializedEnvelope {
  readonly metadata: SerializationMetadata;
  readonly data: SerializedValue;
}

/** Synchronous serializer contract. */
export interface Serializer<TValue = unknown, TSerialized = SerializedValue> {
  /** Canonical name for registry lookup (e.g., "json"). */
  readonly name: string;
  /** The MIME content type produced by this serializer. */
  readonly contentType: string;
  /** Serialize a value into the target format. */
  serialize(value: TValue, options?: SerializeOptions): TSerialized;
  /** Deserialize a value from the target format. */
  deserialize<T = TValue>(value: TSerialized, options?: DeserializeOptions): T;
}

/** Transforms a specific JS type during serialization. */
export interface TypeTransformer<TValue = unknown> {
  /** Tag name used in tagged representations (e.g., "Date"). */
  readonly type: string;
  /** Returns true when this transformer handles the given value. */
  canSerialize(value: unknown): value is TValue;
  /** Convert the value into a JSON-safe representation. */
  serialize(value: TValue, options?: SerializeOptions): unknown;
  /** Reconstruct the original value from the serialized form. */
  deserialize(value: unknown, options?: DeserializeOptions): TValue;
}
