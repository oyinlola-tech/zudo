/**
 * Base RPCError class, options, and factory functions.
 */

import { BaseError } from "../../base/core/baseError.core.js";
import type { BaseErrorOptions } from "../../base/types/baseError.type.js";
import { ErrorCategory } from "../../base/types/errorCategory.type.js";
import { ErrorCode } from "../../base/types/errorCode.type.js";
import { ErrorSeverity } from "../../base/types/errorSeverity.type.js";

/** Options for creating an RPC error. */
export interface RPCErrorOptions extends Omit<BaseErrorOptions, "category"> {
  readonly category?: ErrorCategory;
  readonly procedureName?: string;
}

/** Base error for all RPC failures. */
export class RPCError extends BaseError {
  public readonly procedureName?: string;

  constructor(message: string, options: RPCErrorOptions = {}) {
    super(message, {
      ...options,
      code: options.code ?? ErrorCode.RPC_ERROR,
      category: options.category ?? ErrorCategory.RPC,
      severity: options.severity ?? ErrorSeverity.ERROR,
      statusCode: options.statusCode ?? 500,
      expose: options.expose ?? false,
      isOperational: options.isOperational ?? true,
    });
    this.procedureName = options.procedureName;
  }

  public override toJSON() {
    return {
      ...super.toJSON(),
      ...(this.procedureName !== undefined
        ? { procedureName: this.procedureName }
        : {}),
    };
  }
}

/** Creates an RPC error. */
export function createRPCError(
  message: string,
  options: RPCErrorOptions = {},
): RPCError {
  return new RPCError(message, options);
}

/** Determines whether an unknown value is an RPCError. */
export function isRPCError(value: unknown): value is RPCError {
  return value instanceof RPCError;
}

/** Error thrown when an RPC procedure is not found. */
export class RPCProcedureNotFoundError extends RPCError {
  constructor(procedureName: string) {
    super(`RPC procedure "${procedureName}" is not registered.`, {
      code: ErrorCode.RPC_PROCEDURE_NOT_FOUND,
      procedureName,
      statusCode: 404,
      expose: true,
    });
  }
}

/** Error thrown when an RPC request is invalid. */
export class RPCInvalidRequestError extends RPCError {
  constructor(message = "Invalid RPC request.", procedureName?: string) {
    super(message, {
      code: ErrorCode.RPC_INVALID_REQUEST,
      procedureName,
      statusCode: 400,
      expose: true,
    });
  }
}
