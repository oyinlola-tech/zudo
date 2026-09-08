/**
 * Event lifecycle error classes — publishing, definitions, registry, serialization.
 */

import { ErrorCode } from "../../base/types/errorCode.type.js";
import { assertFiniteNonNegative } from "../shared/domainError.helpers.js";
import { EventError } from "./eventError.base.js";

/** Error raised when event publishing fails. */
export class EventPublishError extends EventError {
  constructor(eventType: string, message?: string, cause?: unknown) {
    super(message ?? `Failed to publish event "${eventType}".`, {
      code: ErrorCode.EVENT_PUBLISH_FAILED,
      eventType,
      cause,
    });
  }
}

/** Error thrown when an event is invalid. */
export class InvalidEventError extends EventError {
  constructor(
    message: string,
    options: {
      eventType?: string;
      eventId?: string;
      cause?: unknown;
    } = {},
  ) {
    super(message, {
      code: ErrorCode.EVENT_INVALID,
      eventType: options.eventType,
      eventId: options.eventId,
      cause: options.cause,
      statusCode: 400,
      expose: true,
    });
  }
}

/**
 * Error thrown when an event type is not registered.
 *
 * Event registration is a server-side concern; reported as internal.
 */
export class EventTypeNotFoundError extends EventError {
  constructor(eventType: string) {
    super(`Event type "${eventType}" is not registered.`, {
      code: ErrorCode.EVENT_TYPE_NOT_FOUND,
      eventType,
      statusCode: 500,
      expose: false,
      isOperational: false,
    });
  }
}

/**
 * Error thrown when an event definition is duplicated.
 *
 * Event registration is a server-side concern; reported as internal.
 */
export class DuplicateEventDefinitionError extends EventError {
  constructor(eventType: string) {
    super(`Event definition "${eventType}" is already registered.`, {
      code: ErrorCode.EVENT_DUPLICATE_DEFINITION,
      eventType,
      statusCode: 500,
      expose: false,
      isOperational: false,
    });
  }
}

/**
 * Error thrown when an event definition is missing.
 *
 * Event registration is a server-side concern; reported as internal.
 */
export class EventDefinitionNotFoundError extends EventError {
  constructor(eventType: string) {
    super(`Event definition "${eventType}" was not found.`, {
      code: ErrorCode.EVENT_DEFINITION_NOT_FOUND,
      eventType,
      statusCode: 500,
      expose: false,
      isOperational: false,
    });
  }
}

/** Error thrown when event dispatch is aborted. */
export class EventDispatchAbortedError extends EventError {
  constructor(
    message = "Event dispatch was aborted.",
    options: { eventType?: string; eventId?: string } = {},
  ) {
    super(message, {
      code: ErrorCode.EVENT_DISPATCH_ABORTED,
      eventType: options.eventType,
      eventId: options.eventId,
      statusCode: 499,
      expose: false,
    });
  }
}

/** Error thrown when an event emitter has been disposed. */
export class EventEmitterDisposedError extends EventError {
  constructor() {
    super("Event emitter has already been disposed.", {
      code: ErrorCode.EVENT_EMITTER_DISPOSED,
      statusCode: 500,
      isOperational: false,
    });
  }
}

/** Error thrown when an event registry has been disposed. */
export class EventRegistryDisposedError extends EventError {
  constructor() {
    super("Event registry has already been disposed.", {
      code: ErrorCode.EVENT_REGISTRY_DISPOSED,
      statusCode: 500,
      isOperational: false,
    });
  }
}

/** Error thrown when an event subscription has been closed. */
export class EventSubscriptionClosedError extends EventError {
  public readonly subscriptionId: string;

  constructor(subscriptionId: string) {
    super(`Event subscription "${subscriptionId}" is already closed.`, {
      code: ErrorCode.EVENT_SUBSCRIPTION_CLOSED,
      metadata: { subscriptionId },
      statusCode: 410,
      expose: true,
    });
    this.subscriptionId = subscriptionId;
  }
}

/** Error thrown when an operation is attempted on a disposed event bus. */
export class EventBusDisposedError extends EventError {
  constructor() {
    super("Event bus has already been disposed.", {
      code: ErrorCode.EVENT_BUS_DISPOSED,
      statusCode: 500,
      isOperational: false,
    });
  }
}

/** Error thrown when an event operation times out. */
export class EventTimeoutError extends EventError {
  public readonly timeoutMs: number;

  constructor(
    timeoutMs: number,
    options: { eventType?: string; eventId?: string } = {},
  ) {
    assertFiniteNonNegative("timeoutMs", timeoutMs);
    super(`Event processing exceeded the timeout of ${timeoutMs}ms.`, {
      code: ErrorCode.EVENT_TIMEOUT,
      eventType: options.eventType,
      eventId: options.eventId,
      metadata: { timeoutMs },
      statusCode: 504,
    });
    this.timeoutMs = timeoutMs;
  }
}
