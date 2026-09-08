/**
 * Common types, branded identifiers, and shared constants.
 *
 * @module common
 */

export {
  type Brand,
  type EntityId,
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

export {
  NONE,
  UNINITIALIZED,
  EMPTY,
  Limits,
  Defaults,
  Sentinel,
  createUserId,
  createEventId,
  createRequestId,
  createCorrelationId,
  createSessionId,
  createTenantId,
  createMessageId,
  createMessageCausationId,
  createTokenId,
  createTimestamp,
  createUrl,
  createEmailAddress,
  createHexString,
  createBase64String,
  createJsonString,
} from "./common.constant.js";

export {
  SerializationFormat,
  SerializationContentType,
  SerializationLimits,
  SerializationTags,
  SERIALIZATION_SCHEMA_VERSION,
} from "./common.serialization.js";

export {
  SchemaIssueCode,
  SCHEMA_DEFAULT_MAX_DEPTH,
  SCHEMA_DEFAULT_MAX_STRING_LENGTH,
  SCHEMA_DEFAULT_MAX_ARRAY_LENGTH,
  SCHEMA_DEFAULT_MAX_OBJECT_KEYS,
  SCHEMA_FORBIDDEN_KEYS,
  SCHEMA_STRING_FORMATS,
} from "./common.schema.js";

export {
  LifecycleState,
  LifecyclePhase,
  LIFECYCLE_VALID_TRANSITIONS,
  LIFECYCLE_DEFAULT_TIMEOUT,
  LIFECYCLE_DEFAULT_START_TIMEOUT,
  LIFECYCLE_DEFAULT_STOP_TIMEOUT,
  LIFECYCLE_DEFAULT_SHUTDOWN_TIMEOUT,
  LIFECYCLE_DEFAULT_CONCURRENCY,
  LIFECYCLE_DEFAULT_RETRY_ATTEMPTS,
  LIFECYCLE_DEFAULT_RETRY_DELAY,
  LIFECYCLE_DEFAULT_RETRY_MAX_DELAY,
} from "./common.lifecycle.js";
