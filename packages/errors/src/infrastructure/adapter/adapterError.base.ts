/**
 * Base AdapterError class, options, and factory functions.
 */

import { BaseError } from "../../base/core/baseError.core.js";
import type { BaseErrorOptions } from "../../base/types/baseError.type.js";
import { ErrorCategory } from "../../base/types/errorCategory.type.js";
import { ErrorCode } from "../../base/types/errorCode.type.js";
import { ErrorSeverity } from "../../base/types/errorSeverity.type.js";

/** Options for creating an adapter error. */
export interface AdapterErrorOptions extends Omit<
  BaseErrorOptions,
  "category"
> {
  readonly category?: ErrorCategory;
  readonly adapter?: string;
}

/** Base error for all adapter failures. */
export class AdapterError extends BaseError {
  public readonly adapter?: string;

  constructor(message: string, options: AdapterErrorOptions = {}) {
    super(message, {
      ...options,
      code: options.code ?? ErrorCode.ADAPTER_OPERATION_FAILED,
      category: options.category ?? ErrorCategory.SERVICE,
      severity: options.severity ?? ErrorSeverity.ERROR,
      statusCode: options.statusCode ?? 500,
      expose: options.expose ?? false,
      isOperational: options.isOperational ?? true,
    });
    this.adapter = options.adapter;
  }

  public override toJSON() {
    return {
      ...super.toJSON(),
      ...(this.adapter !== undefined ? { adapter: this.adapter } : {}),
    };
  }
}

/** Creates an adapter error. */
export function createAdapterError(
  message: string,
  options: AdapterErrorOptions = {},
): AdapterError {
  return new AdapterError(message, options);
}

/** Determines whether an unknown value is an AdapterError. */
export function isAdapterError(value: unknown): value is AdapterError {
  return value instanceof AdapterError;
}

/** Error thrown when an adapter is not found. */
export class AdapterNotFoundError extends AdapterError {
  constructor(adapterName: string) {
    super(`Adapter "${adapterName}" is not registered.`, {
      code: ErrorCode.ADAPTER_NOT_FOUND,
      adapter: adapterName,
      statusCode: 500,
      expose: false,
      isOperational: false,
    });
  }
}

/** Error thrown when an adapter is already registered. */
export class AdapterAlreadyRegisteredError extends AdapterError {
  constructor(adapterName: string) {
    super(`Adapter "${adapterName}" is already registered.`, {
      code: ErrorCode.ADAPTER_ALREADY_REGISTERED,
      adapter: adapterName,
      statusCode: 500,
      expose: false,
      isOperational: false,
    });
  }
}
