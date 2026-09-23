/**
 * @zudojs/events/eventErrors/eventError.base
 *
 * Event error types are centralized in @zudojs/errors and
 * re-exported here, including EventBusStoppedError and
 * EventBusDisposedError. EventDispatchAbortedError is extended here
 * to carry the partial results of an aborted dispatch.
 */

import { EventDispatchAbortedError as BaseEventDispatchAbortedError } from "@zudojs/errors";

export {
  EventError,
  createEventError,
  isEventError,
  toEventError,
  EventPublishError,
  InvalidEventError,
  EventTypeNotFoundError,
  EventHandlerError,
  createEventHandlerError,
  EventHandlerNotFoundError,
  DuplicateEventHandlerError,
  DuplicateEventDefinitionError,
  EventDefinitionNotFoundError,
  EventEmitterDisposedError,
  EventRegistryDisposedError,
  EventSubscriptionClosedError,
  EventListenerLimitExceededError,
  EventTimeoutError,
  EventMiddlewareError,
  EventSerializationError,
  EventDeserializationError,
  EventBusDisposedError,
  EventBusStoppedError,
} from "@zudojs/errors";

/**
 * Options for EventDispatchAbortedError.
 */
export interface EventDispatchAbortedErrorOptions {
  readonly eventType?: string;
  readonly eventId?: string;
  /**
   * Execution results collected before the abort was observed.
   */
  readonly results?: readonly unknown[];
  /**
   * Handler errors collected before the abort was observed.
   */
  readonly errors?: readonly unknown[];
}

/**
 * Error thrown when event dispatch is aborted through an
 * AbortSignal. Carries the partial results and errors gathered
 * before the abort was observed so callers can see what ran.
 */
export class EventDispatchAbortedError extends BaseEventDispatchAbortedError {
  readonly results: readonly unknown[];

  readonly errors: readonly unknown[];

  constructor(
    message = "Event dispatch was aborted.",
    options: EventDispatchAbortedErrorOptions = {},
  ) {
    super(message, {
      eventType: options.eventType,
      eventId: options.eventId,
    });

    this.results = Object.freeze([...(options.results ?? [])]);

    this.errors = Object.freeze([...(options.errors ?? [])]);
  }
}
