/**
 * Converts errors into safe, predictable serialized structures.
 */

import { BaseError } from "../base/core/baseError.core.js";
import {
  pickErrorMetadata,
  redactErrorMetadata,
} from "../base/core/errorMetadata.core.js";
import type { ErrorMetadata } from "../base/core/errorMetadata.type.js";
import type { SerializedBaseError } from "../base/types/baseError.type.js";
import type {
  ErrorSerializerOptions,
  PublicErrorResponse,
  InternalErrorResponse,
} from "./errorSerializer.types.js";
import { normalizeUnknownError } from "./errorSerializer.factory.js";

export type {
  ErrorSerializerOptions,
  PublicErrorResponse,
  InternalErrorResponse,
} from "./errorSerializer.types.js";
export {
  createErrorSerializer,
  serializeError,
  serializePublicError,
  normalizeUnknownError,
} from "./errorSerializer.factory.js";

/** Converts errors into safe, predictable serialized structures. */
export class ErrorSerializer {
  private readonly includeStack: boolean;
  private readonly includeCause: boolean;
  private readonly includeMetadata: boolean;
  private readonly safeMessage: string;
  private readonly redactSensitiveData: boolean;
  private readonly sensitiveKeyPattern: RegExp | undefined;
  private readonly publicMetadataKeys: readonly string[] | undefined;

  constructor(options: ErrorSerializerOptions = {}) {
    this.includeStack = options.includeStack ?? false;
    this.includeCause = options.includeCause ?? false;
    this.includeMetadata = options.includeMetadata ?? true;
    this.safeMessage = options.safeMessage ?? "An unexpected error occurred.";
    this.redactSensitiveData = options.redactSensitiveData ?? true;
    this.sensitiveKeyPattern = options.sensitiveKeyPattern;
    this.publicMetadataKeys = options.publicMetadataKeys;
  }

  /**
   * Serializes an error for internal logging or monitoring.
   *
   * `includeStack`, `includeCause` and `redactSensitiveData` are applied at
   * every level of the cause chain.
   */
  public serialize(error: BaseError): InternalErrorResponse {
    return this.serializeLevel(error.toJSON());
  }

  /**
   * Serializes an error for an untrusted API client.
   *
   * Never includes a stack or cause. Metadata is only included when the error
   * is exposable (or when `publicMetadataKeys` allow-lists specific keys) and
   * is always redacted.
   */
  public serializePublic(error: BaseError): PublicErrorResponse {
    const metadata = this.publicMetadata(error);
    return {
      code: error.code,
      message: error.expose ? error.message : this.safeMessage,
      category: error.category,
      statusCode: error.statusCode,
      ...(metadata !== undefined ? { metadata } : {}),
    };
  }

  /** Serializes an unknown thrown value. */
  public serializeUnknown(value: unknown): InternalErrorResponse {
    return this.serialize(normalizeUnknownError(value));
  }

  /** Creates a public response from an unknown thrown value. */
  public serializeUnknownPublic(value: unknown): PublicErrorResponse {
    return this.serializePublic(normalizeUnknownError(value));
  }

  /** Applies the serializer options to one level of a serialized error. */
  private serializeLevel(serialized: SerializedBaseError): SerializedBaseError {
    const { stack, cause, metadata, ...rest } = serialized;

    const result: SerializedBaseError = {
      ...rest,
      metadata: this.includeMetadata
        ? this.redactSensitiveData
          ? this.redactMetadata(metadata)
          : metadata
        : {},
      ...(this.includeStack && stack !== undefined ? { stack } : {}),
      ...(this.includeCause && cause !== undefined
        ? { cause: this.serializeCause(cause) }
        : {}),
    };

    return result;
  }

  /** Applies the serializer options recursively to a serialized cause. */
  private serializeCause(cause: unknown): unknown {
    if (cause === null || typeof cause !== "object") return cause;
    if (Array.isArray(cause)) return cause;

    const record = cause as Record<string, unknown>;
    if (isSerializedBaseError(record)) {
      return this.serializeLevel(record);
    }

    // Native error shape: { name, message, stack?, cause? }
    const { stack, cause: nested, ...rest } = record;
    return {
      ...rest,
      ...(this.includeStack && stack !== undefined ? { stack } : {}),
      ...(nested !== undefined ? { cause: this.serializeCause(nested) } : {}),
    };
  }

  /** Computes the metadata allowed in a public response. */
  private publicMetadata(
    error: BaseError,
  ): Readonly<Record<string, unknown>> | undefined {
    if (!this.includeMetadata) return undefined;

    let metadata: Readonly<ErrorMetadata>;
    if (this.publicMetadataKeys !== undefined) {
      metadata = pickErrorMetadata(error.metadata, this.publicMetadataKeys);
    } else if (error.expose) {
      metadata = error.metadata;
    } else {
      return undefined;
    }

    const redacted = this.redactSensitiveData
      ? this.redactMetadata(metadata)
      : metadata;
    return Object.keys(redacted).length > 0 ? redacted : undefined;
  }

  /** Removes commonly sensitive metadata fields (recursively). */
  private redactMetadata(
    metadata: Readonly<Record<string, unknown>> | undefined,
  ): Readonly<ErrorMetadata> {
    return redactErrorMetadata(metadata, {
      sensitiveKeyPattern: this.sensitiveKeyPattern,
    });
  }
}

/** Structural check for a serialized BaseError (used on nested causes). */
function isSerializedBaseError(
  value: Record<string, unknown>,
): value is SerializedBaseError & Record<string, unknown> {
  return (
    typeof value.code === "string" &&
    typeof value.category === "string" &&
    typeof value.severity === "string" &&
    typeof value.statusCode === "number" &&
    typeof value.metadata === "object" &&
    value.metadata !== null
  );
}
