/**
 * Event error classes — re-exports from focused files.
 */

export {
  EventError,
  createEventError,
  isEventError,
  toEventError,
} from "./eventError.base.js";
export type { EventErrorOptions } from "./eventError.base.js";

export {
  EventHandlerError,
  createEventHandlerError,
  EventHandlerNotFoundError,
  DuplicateEventHandlerError,
  EventMiddlewareError,
} from "./eventError.handler.js";

export {
  EventPublishError,
  InvalidEventError,
  EventTypeNotFoundError,
  DuplicateEventDefinitionError,
  EventDefinitionNotFoundError,
  EventDispatchAbortedError,
  EventEmitterDisposedError,
  EventRegistryDisposedError,
  EventSubscriptionClosedError,
  EventBusDisposedError,
  EventTimeoutError,
} from "./eventError.lifecycle.js";

export {
  EventSerializationError,
  EventDeserializationError,
} from "./eventError.serialization.js";
