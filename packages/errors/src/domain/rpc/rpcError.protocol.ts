/**
 * RPC protocol error classes — validation, auth, serialization.
 */

import type { ErrorMetadataValue } from "../../base/core/errorMetadata.type.js";
import { ErrorCode } from "../../base/types/errorCode.type.js";
import { RPCError } from "./rpcError.base.js";

/** Error thrown when RPC input validation fails. */
export class RPCValidationError extends RPCError {
  public readonly issues: readonly ErrorMetadataValue[];

  constructor(
    message: string,
    issues: readonly ErrorMetadataValue[] = [],
    procedureName?: string,
  ) {
    super(message, {
      code: ErrorCode.RPC_VALIDATION_ERROR,
      procedureName,
      metadata: { issues },
      statusCode: 422,
      expose: true,
    });
    this.issues = Object.freeze([...issues]);
  }
}

/** Error thrown when RPC authentication fails. */
export class RPCAuthenticationError extends RPCError {
  constructor(
    message = "RPC authentication is required.",
    procedureName?: string,
  ) {
    super(message, {
      code: ErrorCode.RPC_UNAUTHORIZED,
      procedureName,
      statusCode: 401,
      expose: true,
    });
  }
}

/** Error thrown when RPC authorization fails. */
export class RPCForbiddenError extends RPCError {
  constructor(
    message = "You do not have permission to call this RPC procedure.",
    procedureName?: string,
  ) {
    super(message, {
      code: ErrorCode.RPC_FORBIDDEN,
      procedureName,
      statusCode: 403,
      expose: true,
    });
  }
}

/** Error thrown when an unexpected internal RPC error occurs. */
export class RPCInternalError extends RPCError {
  constructor(
    message = "An unexpected internal RPC error occurred.",
    procedureName?: string,
  ) {
    super(message, {
      code: ErrorCode.RPC_INTERNAL_ERROR,
      procedureName,
      statusCode: 500,
      expose: false,
      isOperational: false,
    });
  }
}

/** Error thrown when RPC serialization fails. */
export class RPCSerializationError extends RPCError {
  constructor(message: string, procedureName?: string) {
    super(message, {
      code: ErrorCode.RPC_SERIALIZATION_ERROR,
      procedureName,
      statusCode: 500,
      expose: false,
    });
  }
}

/** Error thrown when RPC deserialization fails. */
export class RPCDeserializationError extends RPCError {
  constructor(message: string, procedureName?: string) {
    super(message, {
      code: ErrorCode.RPC_DESERIALIZATION_ERROR,
      procedureName,
      statusCode: 400,
      expose: true,
    });
  }
}

/** Error thrown when a duplicate RPC procedure is registered. */
export class RPCDuplicateProcedureError extends RPCError {
  constructor(procedureName: string) {
    super(`RPC procedure "${procedureName}" is already registered.`, {
      code: ErrorCode.RPC_DUPLICATE_PROCEDURE,
      procedureName,
      statusCode: 409,
      expose: true,
    });
  }
}
