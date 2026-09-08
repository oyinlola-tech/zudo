/**
 * Serialization-specific constants shared across the Zudojs framework.
 *
 * @module common/common.serialization
 */

import { ContentTypes } from "../http/httpContentType.type.js";
import { Limits } from "./common.constant.js";

/** Canonical serialization format names. */
export const SerializationFormat = Object.freeze({
  JSON: "json",
  TEXT: "text",
  BINARY: "binary",
  MESSAGEPACK: "messagepack",
} as const);

/**
 * MIME content types for serialized data
 * (canonical values: {@link ContentTypes}).
 */
export const SerializationContentType = Object.freeze({
  JSON: ContentTypes.JSON,
  TEXT: ContentTypes.TEXT_PLAIN,
  OCTET: ContentTypes.OCTET_STREAM,
  /** De facto standard MessagePack MIME type. */
  MSGPACK: "application/x-msgpack",
} as const);

/** Default limits for serialization operations. */
export const SerializationLimits = Object.freeze({
  /**
   * Default maximum serialized payload size (10 MB;
   * canonical: {@link Limits.MAX_FILE_SIZE}).
   */
  MAX_SIZE: Limits.MAX_FILE_SIZE,
  /**
   * Default maximum object nesting depth (serializer recursion guard).
   *
   * Intentionally distinct from `Limits.MAX_NESTING_DEPTH` (10 — bound on
   * acceptable user data shape) and `SCHEMA_DEFAULT_MAX_DEPTH` (100 — schema
   * validation recursion guard).
   */
  MAX_DEPTH: 128,
  /** Maximum number of registered type transformers. */
  MAX_TRANSFORMERS: 256,
  /** Maximum length of a type tag string. */
  MAX_TYPE_TAG_LENGTH: 128,
} as const);

/** Type-tag sentinel keys for JSON representation. */
export const SerializationTags = Object.freeze({
  /** Key for the type discriminator in tagged representations. */
  TYPE: "$type",
  /** Key for the value payload inside a tag. */
  VALUE: "$value",
  /** Key for encoding metadata (e.g. base64 for Buffers). */
  ENCODING: "$encoding",
} as const);

/** Current serialization schema version. */
export const SERIALIZATION_SCHEMA_VERSION = 1;
