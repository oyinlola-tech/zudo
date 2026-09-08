/**
 * Error serializer types and interfaces.
 */

import type { SerializedBaseError } from "../base/types/baseError.type.js";
import { ErrorCategory } from "../base/types/errorCategory.type.js";

/** Options controlling error serialization. */
export interface ErrorSerializerOptions {
  /** Include the stack trace (at every level of the cause chain). Defaults to false. */
  readonly includeStack?: boolean;
  /** Include the error cause chain. Defaults to false. */
  readonly includeCause?: boolean;
  /** Include metadata in internal serialization. Defaults to true. */
  readonly includeMetadata?: boolean;
  /** Replace non-exposable error messages with a safe message. */
  readonly safeMessage?: string;
  /** Redact sensitive metadata values (recursively, at every level). Defaults to true. */
  readonly redactSensitiveData?: boolean;
  /** Pattern used to detect sensitive metadata keys. Defaults to the package pattern. */
  readonly sensitiveKeyPattern?: RegExp;
  /**
   * Metadata keys allowed in public output.
   *
   * When provided, only these keys are copied into `PublicErrorResponse.metadata`
   * (for exposed and non-exposed errors alike). When omitted, metadata is only
   * included for errors with `expose: true`, and never for non-exposed errors.
   */
  readonly publicMetadataKeys?: readonly string[];
}

/** Public error representation suitable for an API response. */
export interface PublicErrorResponse {
  readonly code: string;
  readonly message: string;
  readonly category: ErrorCategory;
  readonly statusCode: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Internal serialized error representation. */
export interface InternalErrorResponse extends SerializedBaseError {}
