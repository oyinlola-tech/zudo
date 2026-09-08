/**
 * Plugin lifecycle error classes — registration, dependency, initialization.
 */

import { ErrorCode } from "../../base/types/errorCode.type.js";
import { PluginError, type PluginErrorOptions } from "./pluginError.base.js";

/*
 * Plugin registration, lookup, dependency and state errors describe server
 * configuration problems. They are reported as internal (500, not exposed,
 * non-operational) so that plugin names and dependency graphs never reach
 * clients and so that a misconfigured server is not blamed on the request.
 */

/** Error thrown when a plugin registration fails. */
export class PluginRegistrationError extends PluginError {
  constructor(
    message: string,
    pluginName?: string,
    options: PluginErrorOptions = {},
  ) {
    super(message, {
      ...options,
      code: ErrorCode.PLUGIN_REGISTRATION,
      pluginName,
      statusCode: 500,
      expose: false,
      isOperational: false,
    });
  }
}

/** Error thrown when a plugin is already registered. */
export class PluginAlreadyRegisteredError extends PluginError {
  constructor(pluginName: string, options: PluginErrorOptions = {}) {
    super(`Plugin "${pluginName}" is already registered.`, {
      ...options,
      code: ErrorCode.PLUGIN_ALREADY_REGISTERED,
      pluginName,
      statusCode: 500,
      expose: false,
      isOperational: false,
    });
  }
}

/** Error thrown when a plugin is not found. */
export class PluginNotFoundError extends PluginError {
  constructor(pluginName: string, options: PluginErrorOptions = {}) {
    super(`Plugin "${pluginName}" is not registered.`, {
      ...options,
      code: ErrorCode.PLUGIN_NOT_FOUND,
      pluginName,
      statusCode: 500,
      expose: false,
      isOperational: false,
    });
  }
}

/** Error thrown when a plugin dependency is missing. */
export class PluginDependencyError extends PluginError {
  constructor(
    pluginName: string,
    dependencyName: string,
    options: PluginErrorOptions = {},
  ) {
    super(
      `Plugin "${pluginName}" depends on "${dependencyName}" which is not registered.`,
      {
        ...options,
        code: ErrorCode.PLUGIN_DEPENDENCY,
        pluginName,
        statusCode: 500,
        expose: false,
        isOperational: false,
        metadata: { ...options.metadata, dependencyName },
      },
    );
  }
}

/** Error thrown when a circular plugin dependency is detected. */
export class PluginDependencyCycleError extends PluginError {
  constructor(cycle: readonly string[], options: PluginErrorOptions = {}) {
    super(`Circular plugin dependency detected: ${cycle.join(" -> ")}.`, {
      ...options,
      code: ErrorCode.PLUGIN_DEPENDENCY_CYCLE,
      statusCode: 500,
      expose: false,
      isOperational: false,
      metadata: { ...options.metadata, cycle: [...cycle] },
    });
  }
}

/** Error thrown when a plugin initialization fails. */
export class PluginInitializationError extends PluginError {
  constructor(
    message: string,
    pluginName?: string,
    options: PluginErrorOptions = {},
  ) {
    super(message, {
      ...options,
      code: ErrorCode.PLUGIN_INITIALIZATION,
      pluginName,
      statusCode: 500,
      expose: false,
    });
  }
}

/** Error thrown when a plugin start fails. */
export class PluginStartError extends PluginError {
  constructor(
    message: string,
    pluginName?: string,
    options: PluginErrorOptions = {},
  ) {
    super(message, {
      ...options,
      code: ErrorCode.PLUGIN_START,
      pluginName,
      statusCode: 500,
      expose: false,
    });
  }
}

/** Error thrown when a plugin stop fails. */
export class PluginStopError extends PluginError {
  constructor(
    message: string,
    pluginName?: string,
    options: PluginErrorOptions = {},
  ) {
    super(message, {
      ...options,
      code: ErrorCode.PLUGIN_STOP,
      pluginName,
      statusCode: 500,
      expose: false,
    });
  }
}

/** Error thrown when a plugin dispose fails. */
export class PluginDisposeError extends PluginError {
  constructor(
    message: string,
    pluginName?: string,
    options: PluginErrorOptions = {},
  ) {
    super(message, {
      ...options,
      code: ErrorCode.PLUGIN_DISPOSE,
      pluginName,
      statusCode: 500,
      expose: false,
    });
  }
}
