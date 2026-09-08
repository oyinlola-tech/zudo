/**
 * Common default values, limits, sentinel constants, and branded-type
 * factories.
 *
 * @module common/common
 */

import {
  type UserId,
  type EventId,
  type RequestId,
  type CorrelationId,
  type SessionId,
  type TenantId,
  type MessageId,
  type MessageCausationId,
  type TokenId,
  type Timestamp,
  type Url,
  type EmailAddress,
  type HexString,
  type Base64String,
  type JsonString,
} from "./common.type.js";
import { ContentTypes, Charset } from "../http/httpContentType.type.js";
import { ValidationPattern } from "../validation/validation.pattern.type.js";
import { InvalidConstantError } from "../constantsErrors/constantsError.base.js";

/** Sentinel value indicating absence of a value. */
export const NONE = "NONE" as const;

/** Sentinel value indicating an uninitialized state. */
export const UNINITIALIZED = "UNINITIALIZED" as const;

/** Generic placeholder for empty string contexts. */
export const EMPTY = "" as const;

/**
 * Default numeric limits used across the framework.
 */
export const Limits = Object.freeze({
  /** Maximum string length for display fields */
  MAX_DISPLAY_LENGTH: 255,
  /** Maximum string length for long text fields */
  MAX_TEXT_LENGTH: 10_000,
  /** Maximum string length for short identifiers */
  MAX_ID_LENGTH: 128,
  /** Maximum number of items in a list/page */
  MAX_PAGE_SIZE: 100,
  /** Default page size for paginated queries */
  DEFAULT_PAGE_SIZE: 20,
  /**
   * Maximum depth for general nested data structures (e.g. user-supplied
   * config objects).
   *
   * Intentionally distinct from `SCHEMA_DEFAULT_MAX_DEPTH` (100 — recursion
   * guard for schema validation) and `SerializationLimits.MAX_DEPTH` (128 —
   * recursion guard for the serializer): those bound internal traversal,
   * this bounds acceptable user data shape.
   */
  MAX_NESTING_DEPTH: 10,
  /**
   * Maximum number of retry attempts a caller may configure (upper bound).
   *
   * This is the single source of truth for the retry cap —
   * `ValidationRange.MAX_RETRIES` derives from it. The out-of-the-box default
   * is the (smaller) `DefaultRetry.MAX_ATTEMPTS`.
   */
  MAX_RETRY_ATTEMPTS: 10,
  /** Maximum number of concurrent operations */
  MAX_CONCURRENCY: 10,
  /** Maximum buffer size (64 KB) */
  MAX_BUFFER_SIZE: 65_536,
  /** Maximum file size (10 MB) */
  MAX_FILE_SIZE: 10_485_760,
} as const);

/**
 * Default configuration values for common options.
 */
export const Defaults = Object.freeze({
  /** Default character encoding (canonical: {@link Charset.UTF_8}) */
  ENCODING: Charset.UTF_8,
  /** Default MIME type (canonical: {@link ContentTypes.JSON}) */
  CONTENT_TYPE: ContentTypes.JSON,
  /**
   * Default date format (ISO 8601 with timezone offset; `XXX` renders `Z`
   * for UTC or `±hh:mm` otherwise).
   */
  DATE_FORMAT: "yyyy-MM-dd'T'HH:mm:ss.SSSXXX",
  /** Default time zone */
  TIMEZONE: "UTC",
  /** Default locale */
  LOCALE: "en-US",
  /** Default port number */
  PORT: 3000,
  /** Default hostname */
  HOSTNAME: "localhost",
  /** Default protocol */
  PROTOCOL: "http",
  /** Default salt rounds for hashing */
  SALT_ROUNDS: 12,
} as const);

/**
 * Sentinel values for special states.
 */
export const Sentinel = Object.freeze({
  /** Value indicating null/absence in serialized form */
  NULL: null,
  /** Marker for deleted soft-delete records */
  DELETED: "__DELETED__",
  /** Marker for placeholder data */
  PLACEHOLDER: "__PLACEHOLDER__",
  /** Wildcard for matching all */
  WILDCARD: "*",
} as const);

/**
 * Create a branded UserId from a raw string.
 */
export function createUserId(id: string): UserId {
  return id as UserId;
}

/**
 * Create a branded EventId from a raw string.
 */
export function createEventId(id: string): EventId {
  return id as EventId;
}

/**
 * Create a branded RequestId from a raw string.
 */
export function createRequestId(id: string): RequestId {
  return id as RequestId;
}

/**
 * Create a branded CorrelationId from a raw string.
 */
export function createCorrelationId(id: string): CorrelationId {
  return id as CorrelationId;
}

/**
 * Create a branded SessionId from a raw string.
 */
export function createSessionId(id: string): SessionId {
  return id as SessionId;
}

/**
 * Create a branded TenantId from a raw string.
 */
export function createTenantId(id: string): TenantId {
  return id as TenantId;
}

/**
 * Create a branded MessageId from a raw string.
 */
export function createMessageId(id: string): MessageId {
  return id as MessageId;
}

/**
 * Create a branded MessageCausationId from a raw string.
 */
export function createMessageCausationId(id: string): MessageCausationId {
  return id as MessageCausationId;
}

/**
 * Create a branded TokenId from a raw string.
 */
export function createTokenId(id: string): TokenId {
  return id as TokenId;
}

/**
 * Create a branded Timestamp from an ISO 8601 string.
 *
 * @throws {InvalidConstantError} if the input is not a valid ISO 8601
 * date-time string (e.g. `2024-01-01T00:00:00.000Z`).
 */
export function createTimestamp(iso: string): Timestamp {
  if (
    !ValidationPattern.ISO_DATE_TIME.test(iso) ||
    Number.isNaN(Date.parse(iso))
  ) {
    throw new InvalidConstantError(
      `Invalid ISO 8601 timestamp: ${JSON.stringify(iso)}`,
    );
  }
  return iso as Timestamp;
}

/**
 * Create a branded Url from a raw string.
 *
 * @throws {InvalidConstantError} if the input is not a parseable URL.
 */
export function createUrl(url: string): Url {
  if (!URL.canParse(url)) {
    throw new InvalidConstantError(`Invalid URL: ${JSON.stringify(url)}`);
  }
  return url as Url;
}

/**
 * Create a branded EmailAddress from a raw string.
 *
 * @throws {InvalidConstantError} if the input is not a valid email address.
 */
export function createEmailAddress(email: string): EmailAddress {
  if (email.length > 254 || !ValidationPattern.EMAIL.test(email)) {
    throw new InvalidConstantError(
      `Invalid email address: ${JSON.stringify(email)}`,
    );
  }
  return email as EmailAddress;
}

/**
 * Create a branded HexString from a raw string.
 *
 * @throws {InvalidConstantError} if the input is not even-length hexadecimal.
 */
export function createHexString(hex: string): HexString {
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) {
    throw new InvalidConstantError(
      `Invalid hex string: ${JSON.stringify(hex)}`,
    );
  }
  return hex as HexString;
}

/**
 * Create a branded Base64String from a raw string.
 *
 * @throws {InvalidConstantError} if the input is not valid base64.
 */
export function createBase64String(base64: string): Base64String {
  if (
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      base64,
    )
  ) {
    throw new InvalidConstantError(
      `Invalid base64 string: ${JSON.stringify(base64)}`,
    );
  }
  return base64 as Base64String;
}

/**
 * Create a branded JsonString from a raw string.
 *
 * @throws {InvalidConstantError} if the input is not parseable JSON.
 */
export function createJsonString(json: string): JsonString {
  try {
    JSON.parse(json);
  } catch {
    throw new InvalidConstantError(
      `Invalid JSON string: ${JSON.stringify(json)}`,
    );
  }
  return json as JsonString;
}
