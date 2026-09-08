/**
 * Message factory functions for creating and manipulating messages.
 *
 * @module message/messageFactory
 */

import type {
  Message,
  MessageId,
  MessageCorrelationId,
  MessageCausationId,
  MessageType,
  MessagePayload,
  MessageInput,
} from "./messageType.type.js";

/**
 * Creates a unique message identifier.
 * Returns a branded MessageId type from @zudojs/constants.
 */
export function createMessageId(): MessageId {
  return `msg:${crypto.randomUUID()}` as MessageId;
}

/**
 * Rejects an empty or blank identifier.
 */
function assertNonEmptyId(value: string, kind: string): void {
  if (value.trim().length === 0) {
    throw new TypeError(`A ${kind} must be a non-empty string.`);
  }
}

/**
 * Brands an existing string as a {@link MessageId}.
 *
 * Identifiers arriving from outside the process — a transport frame, a
 * database row, a log record — are plain strings. This is the supported way
 * to restore the branded type without an unchecked cast.
 */
export function toMessageId(value: string): MessageId {
  assertNonEmptyId(value, "MessageId");
  return value as MessageId;
}

/**
 * Brands an existing string as a {@link MessageCorrelationId}.
 */
export function toCorrelationId(value: string): MessageCorrelationId {
  assertNonEmptyId(value, "CorrelationId");
  return value as MessageCorrelationId;
}

/**
 * Brands an existing string as a {@link MessageCausationId}.
 */
export function toCausationId(value: string): MessageCausationId {
  assertNonEmptyId(value, "CausationId");
  return value as MessageCausationId;
}

/**
 * Normalizes a message timestamp.
 */
function normalizeTimestamp(timestamp: MessageInput["timestamp"]): Date {
  if (timestamp instanceof Date) return new Date(timestamp.getTime());
  if (typeof timestamp === "number") {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime()))
      throw new TypeError("Invalid message timestamp.");
    return date;
  }
  return new Date();
}

/**
 * Freezes message metadata.
 */
function normalizeMetadata(
  metadata: MessageInput["metadata"],
): Readonly<Record<string, unknown>> | undefined {
  if (metadata === undefined) return undefined;
  return Object.freeze({ ...metadata });
}

/**
 * Creates an immutable message.
 */
export function createMessage<TPayload = MessagePayload>(
  input: MessageInput<TPayload>,
): Message<TPayload> {
  if (typeof input.type !== "string" || input.type.trim().length === 0) {
    throw new TypeError("Message type must be a non-empty string.");
  }

  return Object.freeze({
    id: input.id ?? createMessageId(),
    type: input.type,
    payload: input.payload,
    timestamp: normalizeTimestamp(input.timestamp),
    source: input.source,
    correlationId: input.correlationId,
    causationId: input.causationId,
    metadata: normalizeMetadata(input.metadata),
  });
}

/**
 * Creates a derived message while preserving correlation.
 */
export function createDerivedMessage<TPayload>(
  sourceMessage: Message,
  input: MessageInput<TPayload>,
): Message<TPayload> {
  return createMessage({
    ...input,
    correlationId:
      input.correlationId ??
      sourceMessage.correlationId ??
      (sourceMessage.id as unknown as MessageCorrelationId),
    causationId:
      input.causationId ?? (sourceMessage.id as unknown as MessageCausationId),
  });
}

/**
 * Determines whether an unknown value satisfies the Message contract.
 */
export function isMessage(value: unknown): value is Message {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.type === "string" &&
    candidate.timestamp instanceof Date &&
    "payload" in candidate
  );
}

/**
 * Returns the message type.
 */
export function getMessageType<TPayload>(
  message: Message<TPayload>,
): MessageType {
  return message.type;
}

/**
 * Returns the message payload.
 */
export function getMessagePayload<TPayload>(
  message: Message<TPayload>,
): TPayload {
  return message.payload;
}

/**
 * Returns a human-readable message description.
 */
export function describeMessage(message: Message): string {
  return `${message.type} (${message.id})`;
}
