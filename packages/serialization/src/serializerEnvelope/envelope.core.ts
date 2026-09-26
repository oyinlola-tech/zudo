/**
 * @zudojs/serialization — Serialization envelope.
 *
 * Wraps serialized data with metadata (format, version, encoding)
 * so consumers know how to deserialize the payload. Essential for
 * messaging, queues, RPC, and cross-service communication.
 */

import type {
  SerializedEnvelope,
  SerializedValue,
  SerializeOptions,
  DeserializeOptions,
} from "../serializerTypes/index.js";
import {
  SerializationFormat,
  SerializationContentType,
  SERIALIZATION_SCHEMA_VERSION,
} from "@zudojs/constants";
import { InvalidSerializedDataError } from "@zudojs/errors";
import { decodeUtf8 } from "../serializerTransformsExt/index.js";
import {
  assertProducibleVersion,
  assertValidEnvelope,
} from "./envelope.assert.js";

export { assertValidEnvelope } from "./envelope.assert.js";

/** Application-level metadata a producer may stamp on an envelope. */
export interface EnvelopeMetadataOptions {
  /**
   * Wire-format version. Defaults to, and may not exceed,
   * `SERIALIZATION_SCHEMA_VERSION`; pass a lower value only to produce an
   * envelope for an older consumer. Not the version of your message shape:
   * that is `schemaVersion`.
   */
  readonly version?: number;
  readonly contentType?: string;
  readonly encoding?: string;
  /** Name of the payload (`"OrderPlaced"`), carried verbatim. */
  readonly type?: string;
  /** Version of the payload's shape, carried verbatim. */
  readonly schemaVersion?: number | string;
}

/**
 * Create a serialization envelope wrapping data with metadata.
 *
 * @param data - The serialized data payload.
 * @param format - The serialization format used (default: "json").
 * @param options - Additional metadata options.
 * @returns A SerializedEnvelope with metadata and data.
 * @throws {SerializationError} when `options.version` is not a wire-format
 *   version this build can read back.
 */
export function createEnvelope(
  data: SerializedValue,
  format: string = SerializationFormat.JSON,
  options: EnvelopeMetadataOptions = {},
): SerializedEnvelope {
  const version = options.version ?? SERIALIZATION_SCHEMA_VERSION;
  assertProducibleVersion(version);
  return {
    metadata: {
      format,
      version,
      contentType: options.contentType ?? contentTypeForFormat(format),
      encoding: options.encoding ?? "utf-8",
      ...(options.type !== undefined ? { type: options.type } : {}),
      ...(options.schemaVersion !== undefined
        ? { schemaVersion: options.schemaVersion }
        : {}),
    },
    data,
  };
}

/**
 * Maps a format identifier to its MIME content type.
 *
 * Defaulting every envelope to `application/json` regardless of format is how
 * a msgpack payload ends up labelled as JSON on the wire.
 */
export function contentTypeForFormat(format: string): string {
  switch (format) {
    case SerializationFormat.JSON:
      return SerializationContentType.JSON;
    case "text":
      return "text/plain";
    case "binary":
      return "application/octet-stream";
    case "messagepack":
    case "msgpack":
      return "application/msgpack";
    default:
      return "application/octet-stream";
  }
}

/**
 * Extract the data from an envelope, validating metadata.
 *
 * @param envelope - The envelope to unwrap.
 * @param expectedFormat - Optional format to validate against.
 * @returns The raw serialized data.
 * @throws {InvalidSerializedDataError} when the envelope is malformed or its
 *   format doesn't match expectations.
 */
export function unwrapEnvelope(
  envelope: SerializedEnvelope,
  expectedFormat?: string,
): SerializedValue {
  assertValidEnvelope(envelope);

  if (expectedFormat && envelope.metadata.format !== expectedFormat) {
    throw new InvalidSerializedDataError(
      `Envelope format mismatch: expected "${expectedFormat}", got "${envelope.metadata.format}"`,
      { format: expectedFormat },
    );
  }
  return envelope.data;
}

/**
 * Serialize a value and wrap it in an envelope.
 *
 * @param value - The value to serialize.
 * @param serializer - The serializer to use.
 * @param format - The format identifier for metadata.
 * @param options - Serialize options forwarded to the serializer. Without this
 *   the helper could only ever call `serialize(value)`, so `preserveTypes`,
 *   `pretty` and the size/depth limits were unreachable through an envelope
 *   unless they happened to be baked into the serializer instance.
 * @param metadata - Application metadata (`type`, `schemaVersion`) to stamp
 *   on the envelope.
 * @returns A SerializedEnvelope containing the serialized data.
 */
export function serializeToEnvelope<T>(
  value: T,
  serializer: {
    serialize: (v: T, options?: SerializeOptions) => string;
    contentType?: string;
  },
  format: string = SerializationFormat.JSON,
  options?: SerializeOptions,
  metadata: Pick<EnvelopeMetadataOptions, "type" | "schemaVersion"> = {},
): SerializedEnvelope {
  const data = serializer.serialize(value, options);
  return createEnvelope(data, format, {
    ...metadata,
    contentType: serializer.contentType,
  });
}

/**
 * Unwrap an envelope and deserialize the data.
 *
 * @param envelope - The envelope to unwrap.
 * @param deserializer - The deserializer to use.
 * @param expectedFormat - Optional format to validate against.
 * @param options - Deserialize options forwarded to the deserializer, so that
 *   `preserveTypes`, `strict`, `maxSize` and `maxDepth` are reachable through
 *   an envelope. Envelope payloads arrive from the wire, which is exactly
 *   where those limits matter.
 * @returns The deserialized value.
 */
export function deserializeFromEnvelope<T>(
  envelope: SerializedEnvelope,
  deserializer: {
    deserialize: <U>(v: string, options?: DeserializeOptions) => U;
  },
  expectedFormat?: string,
  options?: DeserializeOptions,
): T {
  const data = unwrapEnvelope(envelope, expectedFormat);

  if (typeof data === "string") {
    return deserializer.deserialize<T>(data, options);
  }

  const encoding = (envelope.metadata.encoding ?? "utf-8").toLowerCase();
  if (encoding !== "utf-8" && encoding !== "utf8") {
    throw new InvalidSerializedDataError(
      `Unsupported envelope encoding "${envelope.metadata.encoding}": only UTF-8 is supported`,
      { format: envelope.metadata.format },
    );
  }

  return deserializer.deserialize<T>(decodeUtf8(data), options);
}
