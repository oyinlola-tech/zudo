/**
 * Message error classes — re-exports from focused files.
 */

export {
  MessageError,
  createMessageError,
  isMessageError,
  toMessageError,
} from "./messageError.base.js";
export type { MessageErrorOptions } from "./messageError.base.js";

export {
  MessageHandlerError,
  createMessageHandlerError,
  MessageHandlerNotFoundError,
  DuplicateMessageHandlerError,
  MessageMiddlewareError,
} from "./messageError.handler.js";

export {
  MessageDispatchError,
  InvalidMessageError,
  MessageTypeNotFoundError,
  MessageDispatchAbortedError,
  MessageBusDisposedError,
  MessageTimeoutError,
} from "./messageError.lifecycle.js";

export { MessageValidationError } from "./messageError.validation.js";

export {
  MessageSerializationError,
  MessageDeserializationError,
} from "./messageError.serialization.js";
