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
   * (for exposed and non-exposed errors alike). This is the recommended way
   * to publish metadata: name the keys a client may see.
   */
  readonly publicMetadataKeys?: readonly string[];
  /**
   * Copy the whole (redacted) metadata of errors with `expose: true` into
   * `PublicErrorResponse.metadata`. Defaults to false.
   *
   * This was the behaviour before round 12 and is a data-exposure risk:
   * `expose` says the message is safe for a client, not that everything put
   * in `metadata` (decline codes, upstream ids, internal state) is. Prefer
   * `publicMetadataKeys`; enable this only for errors whose metadata is
   * written for clients. Ignored when `publicMetadataKeys` is set.
   */
  readonly exposeMetadata?: boolean;
}

/** Public error representation suitable for an API response. */
export interface PublicErrorResponse {
  readonly code: string;
  readonly message: string;
  readonly category: ErrorCategory;
  readonly statusCode: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
  /**
   * Validation or schema issues of an exposable error (`ValidationError`,
   * `SchemaError` and any error carrying an `issues` array), with submitted
   * values replaced by type descriptions. Absent for non-exposed errors.
   */
  readonly issues?: readonly unknown[];
}

/** Internal serialized error representation. */
export interface InternalErrorResponse extends SerializedBaseError {}
