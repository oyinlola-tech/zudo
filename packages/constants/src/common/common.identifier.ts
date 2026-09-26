/**
 * Branded identifier factories.
 *
 * Each factory checks that it was handed a non-empty string before applying
 * the brand. The brand is compile-time only (see {@link Brand}), so without
 * this check `createUserId("")` and `createUserId(123 as never)` produced a
 * "UserId" that no consumer could tell apart from a real one until it
 * reached a database or a URL.
 *
 * @module common/identifier
 */

import type {
  UserId,
  EventId,
  RequestId,
  CorrelationId,
  SessionId,
  MessageId,
  MessageCausationId,
  TokenId,
} from "./common.type.js";
import { InvalidConstantError } from "../constantsErrors/constantsError.base.js";

/**
 * Asserts that an identifier is a non-empty string.
 *
 * The value itself is never echoed: identifiers include session and token
 * ids, which must not land in a log line through an error message.
 *
 * @throws {InvalidConstantError} when `id` is not a string or is empty.
 */
export function assertIdentifier(id: unknown, label: string): asserts id is string {
  if (typeof id !== "string") {
    throw new InvalidConstantError(
      `${label} must be a non-empty string, received ${id === null ? "null" : typeof id}.`,
    );
  }
  if (id.length === 0) {
    throw new InvalidConstantError(`${label} must be a non-empty string.`);
  }
}

/**
 * Create a branded UserId from a raw string.
 *
 * @throws {InvalidConstantError} if the input is not a non-empty string.
 */
export function createUserId(id: string): UserId {
  assertIdentifier(id, "UserId");
  return id as UserId;
}

/**
 * Create a branded EventId from a raw string.
 *
 * @throws {InvalidConstantError} if the input is not a non-empty string.
 */
export function createEventId(id: string): EventId {
  assertIdentifier(id, "EventId");
  return id as EventId;
}

/**
 * Create a branded RequestId from a raw string.
 *
 * @throws {InvalidConstantError} if the input is not a non-empty string.
 */
export function createRequestId(id: string): RequestId {
  assertIdentifier(id, "RequestId");
  return id as RequestId;
}

/**
 * Create a branded CorrelationId from a raw string.
 *
 * @throws {InvalidConstantError} if the input is not a non-empty string.
 */
export function createCorrelationId(id: string): CorrelationId {
  assertIdentifier(id, "CorrelationId");
  return id as CorrelationId;
}

/**
 * Create a branded SessionId from a raw string.
 *
 * @throws {InvalidConstantError} if the input is not a non-empty string.
 */
export function createSessionId(id: string): SessionId {
  assertIdentifier(id, "SessionId");
  return id as SessionId;
}

/**
 * Create a branded MessageId from a raw string.
 *
 * @throws {InvalidConstantError} if the input is not a non-empty string.
 */
export function createMessageId(id: string): MessageId {
  assertIdentifier(id, "MessageId");
  return id as MessageId;
}

/**
 * Create a branded MessageCausationId from a raw string.
 *
 * @throws {InvalidConstantError} if the input is not a non-empty string.
 */
export function createMessageCausationId(id: string): MessageCausationId {
  assertIdentifier(id, "MessageCausationId");
  return id as MessageCausationId;
}

/**
 * Create a branded TokenId from a raw string.
 *
 * @throws {InvalidConstantError} if the input is not a non-empty string.
 */
export function createTokenId(id: string): TokenId {
  assertIdentifier(id, "TokenId");
  return id as TokenId;
}
