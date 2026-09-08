/**
 * Adapter operation error classes — connection, timeout, capability.
 */

import { ErrorCode } from "../../base/types/errorCode.type.js";
import { AdapterError } from "./adapterError.base.js";

/** Error thrown when an adapter does not support a requested operation. */
export class AdapterNotSupportedError extends AdapterError {
  constructor(adapterName: string, operation: string) {
    super(
      `Adapter "${adapterName}" does not support operation "${operation}".`,
      {
        code: ErrorCode.ADAPTER_NOT_SUPPORTED,
        adapter: adapterName,
        metadata: { operation },
        statusCode: 501,
        expose: true,
      },
    );
  }
}

/** Error thrown when an adapter capability is missing. */
export class AdapterCapabilityMissingError extends AdapterError {
  constructor(adapterName: string, capability: string) {
    super(
      `Adapter "${adapterName}" is missing required capability "${capability}".`,
      {
        code: ErrorCode.ADAPTER_CAPABILITY_MISSING,
        adapter: adapterName,
        metadata: { capability },
        statusCode: 500,
        expose: false,
      },
    );
  }
}

/** Error thrown when an adapter fails to connect. */
export class AdapterConnectionError extends AdapterError {
  constructor(adapterName: string, cause?: unknown) {
    super(`Adapter "${adapterName}" failed to connect.`, {
      code: ErrorCode.ADAPTER_CONNECTION_FAILED,
      adapter: adapterName,
      cause,
      statusCode: 500,
      expose: false,
      isOperational: false,
    });
  }
}

/** Error thrown when an adapter operation fails. */
export class AdapterOperationError extends AdapterError {
  constructor(adapterName: string, operation: string, cause?: unknown) {
    super(`Adapter "${adapterName}" operation "${operation}" failed.`, {
      code: ErrorCode.ADAPTER_OPERATION_FAILED,
      adapter: adapterName,
      cause,
      metadata: { operation },
      statusCode: 500,
      expose: false,
      isOperational: false,
    });
  }
}

/** Error thrown when an adapter operation times out. */
export class AdapterTimeoutError extends AdapterError {
  public readonly timeout: number;

  constructor(
    adapterName: string,
    operation: string,
    timeout: number,
    cause?: unknown,
  ) {
    super(
      `Adapter "${adapterName}" operation "${operation}" timed out after ${timeout}ms.`,
      {
        code: ErrorCode.ADAPTER_TIMEOUT,
        adapter: adapterName,
        cause,
        metadata: { operation, timeout },
        statusCode: 500,
        expose: false,
        isOperational: false,
      },
    );
    this.timeout = timeout;
  }
}
