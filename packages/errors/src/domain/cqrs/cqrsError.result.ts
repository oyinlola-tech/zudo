/**
 * Errors raised when a failed command or query result is unwrapped.
 */

import { ErrorCode } from "../../base/types/errorCode.type.js";
import { CqrsError } from "./cqrsError.base.js";

/**
 * Thrown by `unwrapCommandResult` for a result whose status is `"failure"`.
 *
 * `failure` holds the failure payload the result carried, which is also the
 * error's `cause`. Not exposed to clients: the payload is an internal value.
 */
export class CommandFailedError extends CqrsError {
  public readonly commandType: string;

  public readonly failure: unknown;

  constructor(commandType: string, failure: unknown) {
    super(`Command "${commandType}" failed.`, {
      code: ErrorCode.COMMAND_FAILED,
      statusCode: 500,
      expose: false,
      isOperational: true,
      cause: failure,
      metadata: { commandType },
    });
    this.commandType = commandType;
    this.failure = failure;
  }
}

/**
 * Thrown by `unwrapQueryResult` for a result whose status is `"failure"`.
 *
 * `failure` holds the failure payload the result carried, which is also the
 * error's `cause`. Not exposed to clients: the payload is an internal value.
 */
export class QueryFailedError extends CqrsError {
  public readonly queryType: string;

  public readonly failure: unknown;

  constructor(queryType: string, failure: unknown) {
    super(`Query "${queryType}" failed.`, {
      code: ErrorCode.QUERY_FAILED,
      statusCode: 500,
      expose: false,
      isOperational: true,
      cause: failure,
      metadata: { queryType },
    });
    this.queryType = queryType;
    this.failure = failure;
  }
}
