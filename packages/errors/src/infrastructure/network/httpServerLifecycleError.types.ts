import { ErrorCode } from "../../base/types/errorCode.type.js";
import { HttpServerLifecycleError } from "./httpServerLifecycleError.base.js";

/**
 * Error thrown when an HTTP server operation is attempted in an invalid state.
 */
export class InvalidHttpServerStateError extends HttpServerLifecycleError {
  /** The current server state. */
  public readonly state: string;

  constructor(state: string, operation: string) {
    super(`Cannot ${operation} HTTP server while it is in "${state}" state.`, {
      code: ErrorCode.HTTP_SERVER_INVALID_STATE,
      metadata: { state, operation },
    });
    this.state = state;
  }
}

/**
 * Error thrown when an HTTP server fails to start.
 */
export class HttpServerStartError extends HttpServerLifecycleError {
  constructor(message: string, cause?: unknown) {
    super(message, {
      code: ErrorCode.HTTP_SERVER_START,
      cause,
    });
  }
}

/**
 * Error thrown when an HTTP server fails to stop.
 */
export class HttpServerStopError extends HttpServerLifecycleError {
  constructor(message: string, cause?: unknown) {
    super(message, {
      code: ErrorCode.HTTP_SERVER_STOP,
      cause,
    });
  }
}
