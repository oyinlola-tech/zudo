/**
 * @zudojs/messaging/message
 *
 * Core message types, factory functions, and identity primitives.
 */

export type {
  MessageId,
  MessageType,
  MessageTimestamp,
  MessageSource,
  MessageCorrelationId,
  MessageCausationId,
  MessagePayload,
  Message,
  MessageInput,
} from "./messageType.type.js";

export {
  createMessageId,
  toMessageId,
  toCorrelationId,
  toCausationId,
  createMessage,
  createDerivedMessage,
  isMessage,
  getMessageType,
  getMessagePayload,
  describeMessage,
} from "./messageFactory.js";
