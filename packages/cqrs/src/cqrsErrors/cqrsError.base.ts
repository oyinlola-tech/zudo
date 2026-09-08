import {
  BaseError,
  ErrorCategory,
  ErrorCode,
  ErrorSeverity,
  type BaseErrorOptions,
  type ErrorMetadata,
} from "@zudojs/errors";

/**
 * Base error for failures originating from the CQRS package.
 */
export class CqrsError extends BaseError {
  constructor(message: string, options: BaseErrorOptions = {}) {
    super(message, {
      ...options,
      code: options.code ?? ErrorCode.INTERNAL_ERROR,
      category: options.category ?? ErrorCategory.SYSTEM,
      severity: options.severity ?? ErrorSeverity.ERROR,
      statusCode: options.statusCode ?? 500,
      expose: options.expose ?? false,
      isOperational: options.isOperational ?? true,
    });
  }
}

/**
 * Thrown when a CQRS request is invalid.
 *
 * The error code defaults to `ERR_INVALID_INPUT`; request-specific
 * subclasses (`InvalidCommandError`, `InvalidQueryError`) narrow it.
 */
export class CqrsValidationError extends CqrsError {
  constructor(
    message = "The CQRS request is invalid.",
    metadata?: ErrorMetadata,
    code: ErrorCode | string = ErrorCode.INVALID_INPUT,
  ) {
    super(message, {
      code,
      category: ErrorCategory.VALIDATION,
      severity: ErrorSeverity.WARNING,
      statusCode: 400,
      expose: true,
      isOperational: true,
      metadata,
    });
  }
}

/**
 * Thrown by the command bus when a command is malformed
 * (not an object, or missing a non-empty `type`).
 */
export class InvalidCommandError extends CqrsValidationError {
  constructor(message = "The command is invalid.", metadata?: ErrorMetadata) {
    super(message, metadata, ErrorCode.INVALID_COMMAND);
  }
}

/**
 * Thrown by the query bus when a query is malformed
 * (not an object, or missing a non-empty `type`).
 */
export class InvalidQueryError extends CqrsValidationError {
  constructor(message = "The query is invalid.", metadata?: ErrorMetadata) {
    super(message, metadata, ErrorCode.INVALID_QUERY);
  }
}

/**
 * Thrown when a command handler cannot be resolved.
 */
export class CommandHandlerNotFoundError extends CqrsError {
  public readonly commandType: string;

  constructor(commandType: string) {
    super(`No command handler is registered for "${commandType}".`, {
      code: ErrorCode.COMMAND_HANDLER_NOT_FOUND,
      category: ErrorCategory.SYSTEM,
      severity: ErrorSeverity.ERROR,
      statusCode: 500,
      expose: false,
      isOperational: true,
      metadata: {
        commandType,
      },
    });

    this.commandType = commandType;
  }
}

/**
 * Thrown when a query handler cannot be resolved.
 */
export class QueryHandlerNotFoundError extends CqrsError {
  public readonly queryType: string;

  constructor(queryType: string) {
    super(`No query handler is registered for "${queryType}".`, {
      code: ErrorCode.QUERY_HANDLER_NOT_FOUND,
      category: ErrorCategory.SYSTEM,
      severity: ErrorSeverity.ERROR,
      statusCode: 500,
      expose: false,
      isOperational: true,
      metadata: {
        queryType,
      },
    });

    this.queryType = queryType;
  }
}

/**
 * Thrown when an event handler fails during publication.
 */
export class EventHandlerExecutionError extends CqrsError {
  public readonly eventType: string;

  public readonly eventId?: string;

  constructor(eventType: string, eventId?: string, cause?: unknown) {
    super(`An event handler failed while processing "${eventType}".`, {
      code: ErrorCode.EVENT_HANDLER_FAILED,
      category: ErrorCategory.SYSTEM,
      severity: ErrorSeverity.ERROR,
      statusCode: 500,
      expose: false,
      isOperational: true,
      cause,
      metadata: {
        eventType,
        eventId,
      },
    });

    this.eventType = eventType;

    this.eventId = eventId;
  }
}

/**
 * Thrown when attempting to register a duplicate handler.
 */
export class DuplicateHandlerError extends CqrsError {
  public readonly handlerKind: "command" | "query";

  public readonly handlerType: string;

  constructor(handlerKind: "command" | "query", handlerType: string) {
    super(
      `A ${handlerKind} handler is already registered for "${handlerType}".`,
      {
        code: ErrorCode.CONFLICT,
        category: ErrorCategory.CONFLICT,
        severity: ErrorSeverity.WARNING,
        statusCode: 409,
        expose: true,
        isOperational: true,
        metadata: {
          handlerKind,
          handlerType,
        },
      },
    );

    this.handlerKind = handlerKind;

    this.handlerType = handlerType;
  }
}

/**
 * Thrown when an event cannot be published.
 */
export class EventPublishError extends CqrsError {
  public readonly eventType: string;

  public readonly eventId?: string;

  constructor(eventType: string, eventId?: string, cause?: unknown) {
    super(`Failed to publish event "${eventType}".`, {
      code: ErrorCode.EVENT_HANDLER_FAILED,
      category: ErrorCategory.SYSTEM,
      severity: ErrorSeverity.ERROR,
      statusCode: 500,
      expose: false,
      isOperational: true,
      cause,
      metadata: {
        eventType,
        eventId,
      },
    });

    this.eventType = eventType;

    this.eventId = eventId;
  }
}

/**
 * Thrown when a handler is registered with an invalid type.
 */
export class InvalidHandlerTypeError extends CqrsValidationError {
  public readonly handlerKind: "command" | "query" | "event";

  constructor(
    handlerKind: "command" | "query" | "event",
    handlerType: unknown,
  ) {
    super(`Invalid ${handlerKind} handler type: "${String(handlerType)}".`, {
      handlerKind,
      handlerType: String(handlerType),
    });

    this.handlerKind = handlerKind;
  }
}

/**
 * Thrown when a registry operation receives an unsupported handler kind.
 */
export class InvalidHandlerKindError extends CqrsValidationError {
  public readonly handlerKind: string;

  constructor(handlerKind: unknown) {
    super(
      `Unsupported handler kind "${String(handlerKind)}". Expected "command" or "query".`,
      {
        handlerKind: String(handlerKind),
      },
    );

    this.handlerKind = String(handlerKind);
  }
}

/**
 * Thrown when CQRS middleware is invalid.
 */
export class InvalidMiddlewareError extends CqrsValidationError {
  constructor(message = "Invalid CQRS middleware.", metadata?: ErrorMetadata) {
    super(message, metadata);
  }
}

/**
 * Thrown when middleware invokes next() more than once.
 */
export class MiddlewareExecutionError extends CqrsError {
  constructor(
    message = "CQRS middleware called next() more than once.",
    cause?: unknown,
  ) {
    super(message, {
      code: ErrorCode.INTERNAL_ERROR,
      category: ErrorCategory.SYSTEM,
      severity: ErrorSeverity.ERROR,
      statusCode: 500,
      expose: false,
      isOperational: true,
      cause,
    });
  }
}

/**
 * Thrown when a CQRS handler has not been configured correctly.
 */
export class HandlerConfigurationError extends CqrsError {
  constructor(
    message = "The CQRS handler is incorrectly configured.",
    metadata?: ErrorMetadata,
  ) {
    super(message, {
      code: ErrorCode.CONFIGURATION_ERROR,
      category: ErrorCategory.CONFIGURATION,
      severity: ErrorSeverity.ERROR,
      statusCode: 500,
      expose: false,
      isOperational: true,
      metadata,
    });
  }
}

/**
 * Determines whether an unknown value is a CQRS error.
 */
export function isCqrsError(error: unknown): error is CqrsError {
  return error instanceof CqrsError;
}

/**
 * Converts an unknown error into a CQRS error.
 *
 * - `CqrsError` instances are returned unchanged.
 * - Other `BaseError` instances keep their code, status, category,
 *   severity, exposure and operational flags (and metadata).
 * - Plain `Error` instances become a non-operational 500 `CqrsError`
 *   using the original message.
 * - Anything else becomes a non-operational 500 `CqrsError` using the
 *   supplied `message`; the original value is attached as `cause`.
 */
export function toCqrsError(
  error: unknown,
  message = "CQRS execution failed.",
): CqrsError {
  if (error instanceof CqrsError) {
    return error;
  }

  if (error instanceof BaseError) {
    return new CqrsError(error.message, {
      code: error.code,
      category: error.category,
      severity: error.severity,
      statusCode: error.statusCode,
      expose: error.expose,
      isOperational: error.isOperational,
      metadata: error.metadata,
      cause: error,
    });
  }

  return new CqrsError(error instanceof Error ? error.message : message, {
    code: ErrorCode.INTERNAL_ERROR,
    category: ErrorCategory.SYSTEM,
    severity: ErrorSeverity.ERROR,
    statusCode: 500,
    expose: false,
    isOperational: false,
    cause: error,
  });
}
