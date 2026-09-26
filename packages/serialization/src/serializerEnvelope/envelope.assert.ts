/**
 * @zudojs/serialization — Envelope assertions.
 *
 * Shape and version checks for envelopes produced here and received from
 * the wire.
 */

import { SERIALIZATION_SCHEMA_VERSION } from "@zudojs/constants";
import { InvalidSerializedDataError, SerializationError } from "@zudojs/errors";

import type {
  SerializedEnvelope,
  SerializationMetadata,
} from "../serializerTypes/index.js";

/**
 * Rejects a wire-format version this build cannot read back.
 *
 * `createEnvelope(data, "json", { version: 2 })` used to be accepted and
 * then refused by `unwrapEnvelope` in the same process, because callers took
 * `version` for their own schema version.
 *
 * @throws {SerializationError} for a non-integer, non-positive or too-new version.
 */
export function assertProducibleVersion(version: number): void {
  if (
    !Number.isInteger(version) ||
    version < 1 ||
    version > SERIALIZATION_SCHEMA_VERSION
  ) {
    throw new SerializationError(
      `Envelope version must be an integer between 1 and ${SERIALIZATION_SCHEMA_VERSION} (the wire-format version); ` +
        `got ${String(version)}. Put your message's own version in metadata.schemaVersion.`,
      { format: "envelope" },
    );
  }
}

/**
 * Validates that a value received from the wire is a well-formed envelope.
 *
 * @param envelope - The candidate envelope.
 * @throws {InvalidSerializedDataError} when the shape or schema version is
 *   unusable. Envelope payloads arrive from a queue or an RPC peer, so a
 *   rejection has to be distinguishable from an internal bug: a bare `Error`
 *   left callers unable to tell hostile input from a defect of their own.
 */
export function assertValidEnvelope(
  envelope: unknown,
): asserts envelope is SerializedEnvelope {
  if (typeof envelope !== "object" || envelope === null) {
    throw new InvalidSerializedDataError(
      `Malformed envelope: expected an object, got ${envelope === null ? "null" : typeof envelope}`,
      { format: "envelope" },
    );
  }

  const candidate = envelope as { metadata?: unknown; data?: unknown };

  if (typeof candidate.metadata !== "object" || candidate.metadata === null) {
    throw new InvalidSerializedDataError(
      "Malformed envelope: missing metadata",
      { format: "envelope" },
    );
  }

  const metadata = candidate.metadata as Partial<SerializationMetadata>;

  if (typeof metadata.format !== "string" || metadata.format.length === 0) {
    throw new InvalidSerializedDataError(
      "Malformed envelope: metadata.format is missing",
      { format: "envelope" },
    );
  }

  if (
    typeof candidate.data !== "string" &&
    !(candidate.data instanceof Uint8Array)
  ) {
    throw new InvalidSerializedDataError(
      "Malformed envelope: data must be a string or Uint8Array",
      { format: "envelope" },
    );
  }

  if (metadata.type !== undefined && typeof metadata.type !== "string") {
    throw new InvalidSerializedDataError(
      "Malformed envelope: metadata.type must be a string",
      { format: "envelope" },
    );
  }

  if (
    metadata.schemaVersion !== undefined &&
    typeof metadata.schemaVersion !== "string" &&
    typeof metadata.schemaVersion !== "number"
  ) {
    throw new InvalidSerializedDataError(
      "Malformed envelope: metadata.schemaVersion must be a string or number",
      { format: "envelope" },
    );
  }

  // The version exists so a future producer can be detected rather than
  // silently misread. Older versions stay readable; newer ones do not.
  if (metadata.version !== undefined) {
    if (!Number.isInteger(metadata.version)) {
      throw new InvalidSerializedDataError(
        `Malformed envelope: metadata.version must be an integer, got ${String(metadata.version)}`,
        { format: "envelope" },
      );
    }
    if (metadata.version > SERIALIZATION_SCHEMA_VERSION) {
      throw new InvalidSerializedDataError(
        `Unsupported envelope wire-format version ${metadata.version}: this build understands up to ${SERIALIZATION_SCHEMA_VERSION}`,
        { format: "envelope" },
      );
    }
  }
}
