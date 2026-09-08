/**
 * Adapter lifecycle error classes — initialization, configuration, disposal.
 */

import { ErrorCode } from "../../base/types/errorCode.type.js";
import { AdapterError } from "./adapterError.base.js";

/** Error thrown when an adapter fails to initialize. */
export class AdapterInitializationError extends AdapterError {
  constructor(adapterName: string, cause?: unknown) {
    super(`Adapter "${adapterName}" failed to initialize.`, {
      code: ErrorCode.ADAPTER_INITIALIZATION_FAILED,
      adapter: adapterName,
      cause,
      statusCode: 500,
      expose: false,
      isOperational: false,
    });
  }
}

/** Error thrown when an adapter fails to configure. */
export class AdapterConfigurationError extends AdapterError {
  constructor(adapterName: string, cause?: unknown) {
    super(`Adapter "${adapterName}" configuration failed.`, {
      code: ErrorCode.ADAPTER_CONFIGURATION_FAILED,
      adapter: adapterName,
      cause,
      statusCode: 500,
      expose: false,
      isOperational: false,
    });
  }
}

/** Error thrown when an adapter fails to dispose. */
export class AdapterDisposeError extends AdapterError {
  constructor(adapterName: string, cause?: unknown) {
    super(`Adapter "${adapterName}" failed to dispose.`, {
      code: ErrorCode.ADAPTER_DISPOSE_FAILED,
      adapter: adapterName,
      cause,
      statusCode: 500,
      expose: false,
      isOperational: false,
    });
  }
}
