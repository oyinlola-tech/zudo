/**
 * @zudojs/events/eventErrors/eventError.base
 *
 * Event error types are centralized in @zudojs/errors and
 * re-exported here. A few event-bus specific errors that the
 * errors package does not define yet live in this file.
 */

import {
  ErrorCode,
  EventError,
  EventDispatchAbortedError as BaseEventDispatchAbortedError,
} from "@zudojs/errors";

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
  EventTimeoutError,
  EventMiddlewareError,
  EventSerializationError,
  EventDeserializationError,
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

/**
 * Error thrown when an EventBus is used after dispose().
 */
export class EventBusDisposedError extends EventError {
  constructor() {
    super("Event bus has already been disposed.", {
      code: ErrorCode.LIFECYCLE_DISPOSED,
      statusCode: 500,
      expose: false,
      isOperational: false,
    });
  }
}

/**
 * Error thrown when publishing or subscribing on a stopped
 * EventBus. Call start() to resume.
 */
export class EventBusStoppedError extends EventError {
  constructor(operation: string) {
    super(`Cannot ${operation} on a stopped event bus. Call start() first.`, {
      code: ErrorCode.LIFECYCLE_STATE,
      statusCode: 500,
      expose: false,
      isOperational: true,
      metadata: { operation },
    });
  }
}

/**
 * Error thrown when the listener limit of an emitter or registry
 * is exceeded and the limit is configured to be enforced.
 */
export class EventListenerLimitExceededError extends EventError {
  constructor(pattern: string, limit: number) {
    super(
      `Listener limit of ${limit} exceeded for event pattern "${pattern}".`,
      {
        code: ErrorCode.LIFECYCLE_STATE,
        statusCode: 500,
        expose: false,
        metadata: { pattern, limit },
      },
    );
  }
}
