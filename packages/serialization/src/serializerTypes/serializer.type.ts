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
  /**
   * Version of the envelope's wire format, i.e. `SERIALIZATION_SCHEMA_VERSION`
   * (currently 1). It is owned by this package, not by the application: a
   * consumer refuses an envelope whose version is newer than it understands.
   * The version of *your* message shape belongs in {@link schemaVersion}.
   */
  readonly version?: number;
  /** MIME content type (e.g., "application/json"). */
  readonly contentType?: string;
  /** Character encoding (e.g., "utf-8"). */
  readonly encoding?: string;
  /**
   * Application-level name of what the payload is (`"OrderPlaced"`), so a
   * consumer can route an envelope without deserializing it first.
   */
  readonly type?: string;
  /**
   * Application-level version of the payload's shape (`2` or `"2026-01"`),
   * for the consumer's own forward/backward compatibility handling. Carried
   * verbatim; this package never interprets it.
   */
  readonly schemaVersion?: number | string;
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

/**
 * Transforms a specific JS type during serialization.
 *
 * On the wire a transformed value is always the tagged object
 * `{ "$type": type, "$value": ... }`.
 */
export interface TypeTransformer<TValue = unknown> {
  /** Tag name used in tagged representations (e.g., "Date"). */
  readonly type: string;
  /** Returns true when this transformer handles the given value. */
  canSerialize(value: unknown): value is TValue;
  /**
   * Convert the value into a JSON-safe representation.
   *
   * Return either just the value to store (for example
   * `v.toString()`), which the serializer wraps as
   * `{ $type: type, $value: <returned> }`, or the full tagged object
   * `{ $type: type, $value: ... }` yourself (as the built-ins do). A plain
   * object with its own string `$type` is taken to be the full tagged
   * object; anything else is wrapped. Nested special values inside the
   * returned value are transformed too.
   */
  serialize(value: TValue, options?: SerializeOptions): unknown;
  /**
   * Reconstruct the original value. Always receives the full tagged object
   * `{ $type, $value }` (with nested values already restored), whichever
   * form `serialize` returned, so read `$value` from it.
   */
  deserialize(value: unknown, options?: DeserializeOptions): TValue;
}
