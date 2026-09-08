/**
 * Schema error base class and options.
 */

import { BaseError } from "../../base/core/baseError.core.js";
import type { BaseErrorOptions } from "../../base/types/baseError.type.js";
import { ErrorCode } from "../../base/types/errorCode.type.js";
import { ErrorCategory } from "../../base/types/errorCategory.type.js";
import { ErrorSeverity } from "../../base/types/errorSeverity.type.js";
import {
  redactIssueValues,
  toJsonSafeIssues,
} from "../shared/domainError.helpers.js";

/** Options for constructing a SchemaError. */
export interface SchemaErrorOptions extends Omit<BaseErrorOptions, "category"> {
  readonly category?: ErrorCategory;
  readonly issues?: readonly unknown[];
}

/**
 * Base error for all schema validation failures.
 *
 * Carries structured issues that describe exactly what failed. The issues
 * array is a frozen copy of the caller's input. When the error is exposable
 * (the default), `toJSON()` replaces submitted values inside issues
 * (`value`, `received`, `input`, `actual`) with a type/size description so
 * that secrets submitted by a client are never echoed back or logged.
 */
export class SchemaError extends BaseError {
  public readonly issues: readonly unknown[];

  constructor(message: string, options: SchemaErrorOptions = {}) {
    super(message, {
      ...options,
      code: options.code ?? ErrorCode.SCHEMA_VALIDATION,
      category: options.category ?? ErrorCategory.VALIDATION,
      severity: options.severity ?? ErrorSeverity.WARNING,
      statusCode: options.statusCode ?? 400,
      expose: options.expose ?? true,
      isOperational: options.isOperational ?? true,
    });
    this.issues = Object.freeze([...(options.issues ?? [])]);
  }

  /** Returns whether any issues were recorded. */
  public hasIssues(): boolean {
    return this.issues.length > 0;
  }

  /** Returns a serialized representation including (redacted) issues. */
  public override toJSON() {
    const safeIssues = toJsonSafeIssues(this.issues);
    return {
      ...super.toJSON(),
      issues: this.expose ? redactIssueValues(safeIssues) : safeIssues,
    };
  }
}

/** Creates a schema error. */
export function createSchemaError(
  message: string,
  options: SchemaErrorOptions = {},
): SchemaError {
  return new SchemaError(message, options);
}

/** Determines whether an unknown value is a SchemaError. */
export function isSchemaError(value: unknown): value is SchemaError {
  return value instanceof SchemaError;
}
