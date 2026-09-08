/**
 * @zudojs/serialization — Serialization envelope.
 *
 * Wraps serialized data with metadata (format, version, encoding)
 * so consumers know how to deserialize the payload. Essential for
 * messaging, queues, RPC, and cross-service communication.
 */

import type {
  SerializedEnvelope,
  SerializationMetadata,
  SerializedValue,
} from "../serializerTypes/index.js";
import {
  SerializationFormat,
  SerializationContentType,
  SERIALIZATION_SCHEMA_VERSION,
} from "@zudojs/constants";
import { decodeUtf8 } from "../serializerTransformsExt/index.js";

/**
 * Create a serialization envelope wrapping data with metadata.
 *
 * @param data - The serialized data payload.
 * @param format - The serialization format used (default: "json").
 * @param options - Additional metadata options.
 * @returns A SerializedEnvelope with metadata and data.
 */
export function createEnvelope(
  data: SerializedValue,
  format: string = SerializationFormat.JSON,
  options: {
    readonly version?: number;
    readonly contentType?: string;
    readonly encoding?: string;
  } = {},
): SerializedEnvelope {
  return {
    metadata: {
      format,
      version: options.version ?? SERIALIZATION_SCHEMA_VERSION,
      contentType: options.contentType ?? contentTypeForFormat(format),
      encoding: options.encoding ?? "utf-8",
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
 * Validates that a value received from the wire is a well-formed envelope.
 *
 * @param envelope - The candidate envelope.
 * @throws {Error} when the shape or schema version is unusable.
 */
export function assertValidEnvelope(
  envelope: unknown,
): asserts envelope is SerializedEnvelope {
  if (typeof envelope !== "object" || envelope === null) {
    throw new Error(
      `Malformed envelope: expected an object, got ${envelope === null ? "null" : typeof envelope}`,
    );
  }

  const candidate = envelope as { metadata?: unknown; data?: unknown };

  if (typeof candidate.metadata !== "object" || candidate.metadata === null) {
    throw new Error("Malformed envelope: missing metadata");
  }

  const metadata = candidate.metadata as Partial<SerializationMetadata>;

  if (typeof metadata.format !== "string" || metadata.format.length === 0) {
    throw new Error("Malformed envelope: metadata.format is missing");
  }

  if (
    typeof candidate.data !== "string" &&
    !(candidate.data instanceof Uint8Array)
  ) {
    throw new Error("Malformed envelope: data must be a string or Uint8Array");
  }

  // The version exists so a future producer can be detected rather than
  // silently misread. Older versions stay readable; newer ones do not.
  if (metadata.version !== undefined) {
    if (!Number.isInteger(metadata.version)) {
      throw new Error(
        `Malformed envelope: metadata.version must be an integer, got ${String(metadata.version)}`,
      );
    }
    if (metadata.version > SERIALIZATION_SCHEMA_VERSION) {
      throw new Error(
        `Unsupported envelope schema version ${metadata.version}: this build understands up to ${SERIALIZATION_SCHEMA_VERSION}`,
      );
    }
  }
}

/**
 * Extract the data from an envelope, validating metadata.
 *
 * @param envelope - The envelope to unwrap.
 * @param expectedFormat - Optional format to validate against.
 * @returns The raw serialized data.
 * @throws {Error} when the envelope format doesn't match expectations.
 */
export function unwrapEnvelope(
  envelope: SerializedEnvelope,
  expectedFormat?: string,
): SerializedValue {
  assertValidEnvelope(envelope);

  if (expectedFormat && envelope.metadata.format !== expectedFormat) {
    throw new Error(
      `Envelope format mismatch: expected "${expectedFormat}", got "${envelope.metadata.format}"`,
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
 * @returns A SerializedEnvelope containing the serialized data.
 */
export function serializeToEnvelope<T>(
  value: T,
  serializer: { serialize: (v: T) => string; contentType?: string },
  format: string = SerializationFormat.JSON,
): SerializedEnvelope {
  const data = serializer.serialize(value);
  return createEnvelope(data, format, {
    contentType: serializer.contentType,
  });
}

/**
 * Unwrap an envelope and deserialize the data.
 *
 * @param envelope - The envelope to unwrap.
 * @param deserializer - The deserializer to use.
 * @param expectedFormat - Optional format to validate against.
 * @returns The deserialized value.
 */
export function deserializeFromEnvelope<T>(
  envelope: SerializedEnvelope,
  deserializer: { deserialize: <U>(v: string) => U },
  expectedFormat?: string,
): T {
  const data = unwrapEnvelope(envelope, expectedFormat);

  if (typeof data === "string") {
    return deserializer.deserialize<T>(data);
  }

  const encoding = (envelope.metadata.encoding ?? "utf-8").toLowerCase();
  if (encoding !== "utf-8" && encoding !== "utf8") {
    throw new Error(
      `Unsupported envelope encoding "${envelope.metadata.encoding}": only UTF-8 is supported`,
    );
  }

  return deserializer.deserialize<T>(decodeUtf8(data));
}
