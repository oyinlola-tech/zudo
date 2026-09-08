/**
 * Plugin runtime error classes — timeout, state transitions.
 */

import { ErrorCode } from "../../base/types/errorCode.type.js";
import { assertFiniteNonNegative } from "../shared/domainError.helpers.js";
import { PluginError, type PluginErrorOptions } from "./pluginError.base.js";

/** Error thrown when a plugin operation times out. */
export class PluginTimeoutError extends PluginError {
  constructor(
    pluginName: string,
    timeout: number,
    options: PluginErrorOptions = {},
  ) {
    assertFiniteNonNegative("timeout", timeout);
    super(`Plugin "${pluginName}" timed out after ${timeout}ms.`, {
      ...options,
      code: ErrorCode.PLUGIN_TIMEOUT,
      pluginName,
      statusCode: 504,
      expose: false,
      metadata: { ...options.metadata, timeout },
    });
  }
}

/**
 * Error thrown when an invalid plugin state transition is attempted.
 *
 * Plugin state is server-side; reported as internal (500, not exposed).
 */
export class PluginStateError extends PluginError {
  constructor(
    pluginName: string,
    fromState: string,
    toState: string,
    options: PluginErrorOptions = {},
  ) {
    super(
      `Cannot transition plugin "${pluginName}" from "${fromState}" to "${toState}".`,
      {
        ...options,
        code: ErrorCode.PLUGIN_STATE,
        pluginName,
        statusCode: 500,
        expose: false,
        isOperational: false,
        metadata: { ...options.metadata, fromState, toState },
      },
    );
  }
}
