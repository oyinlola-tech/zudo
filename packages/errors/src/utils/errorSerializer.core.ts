/**
 * Converts errors into safe, predictable serialized structures.
 */

import { BaseError } from "../base/core/baseError.core.js";
import { redactErrorMetadata } from "../base/core/errorMetadata.core.js";
import {
  isGenuineSerializedBaseError,
  MAX_CAUSE_DEPTH,
  toJSONWithFrame,
} from "../base/core/baseError.serialize.js";
import {
  redactCauseFields,
  redactCauseValue,
} from "../base/core/errorCause.redact.js";
import type { ErrorMetadata } from "../base/core/errorMetadata.type.js";
import type { SerializedBaseError } from "../base/types/baseError.type.js";
import type {
  ErrorSerializerOptions,
  PublicErrorResponse,
  InternalErrorResponse,
} from "./errorSerializer.types.js";
import { normalizeUnknownError } from "./errorSerializer.factory.js";
import {
  selectPublicIssues,
  selectPublicMetadata,
} from "./errorSerializer.public.js";

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
  private readonly exposeMetadata: boolean;

  constructor(options: ErrorSerializerOptions = {}) {
    this.includeStack = options.includeStack ?? false;
    this.includeCause = options.includeCause ?? false;
    this.includeMetadata = options.includeMetadata ?? true;
    this.safeMessage = options.safeMessage ?? "An unexpected error occurred.";
    this.redactSensitiveData = options.redactSensitiveData ?? true;
    this.sensitiveKeyPattern = options.sensitiveKeyPattern;
    this.publicMetadataKeys = options.publicMetadataKeys;
    this.exposeMetadata = options.exposeMetadata ?? false;
  }

  /**
   * Serializes an error for internal logging or monitoring.
   *
   * `includeStack`, `includeCause` and `redactSensitiveData` are applied at
   * every level of the cause chain, including array causes and plain-object
   * causes that merely look like a serialized BaseError.
   */
  public serialize(error: BaseError): InternalErrorResponse {
    const raw = toJSONWithFrame(error, { depth: 0, redact: false });
    return this.serializeLevel(raw as unknown as SerializedBaseError, 0);
  }

  /**
   * Serializes an error for an untrusted API client.
   *
   * Never includes a stack or cause. Metadata is included only for keys
   * allow-listed by `publicMetadataKeys`, or, with `exposeMetadata`, for
   * errors with `expose: true`; either way it is redacted. The `issues` of an
   * exposable validation or schema error are included with submitted values
   * replaced by type descriptions.
   */
  public serializePublic(error: BaseError): PublicErrorResponse {
    const metadata = this.publicMetadata(error);
    const issues = selectPublicIssues(error);
    return {
      code: error.code,
      message: error.expose ? error.message : this.safeMessage,
      category: error.category,
      statusCode: error.statusCode,
      ...(metadata !== undefined ? { metadata } : {}),
      ...(issues !== undefined ? { issues } : {}),
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
  private serializeLevel(
    serialized: SerializedBaseError,
    depth: number,
  ): SerializedBaseError {
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
        ? { cause: this.serializeCause(cause, depth + 1) }
        : {}),
    };

    return result;
  }

  /**
   * Applies the serializer options recursively to a serialized cause.
   *
   * Only objects that a BaseError's `toJSON` really produced are treated as
   * serialized BaseErrors (whose `metadata` alone needs redacting). Anything
   * else, including a plain object carrying the same field names and any
   * array, has every field walked and redacted.
   */
  private serializeCause(cause: unknown, depth: number): unknown {
    if (depth > MAX_CAUSE_DEPTH) return "[MaxDepth]";
    if (cause === null || typeof cause !== "object") return cause;
    if (Array.isArray(cause)) {
      return this.redactSensitiveData
        ? redactCauseValue(cause, this.sensitiveKeyPattern)
        : cause;
    }

    const record = cause as Record<string, unknown>;
    if (isGenuineSerializedBaseError(record)) {
      return this.serializeLevel(record as unknown as SerializedBaseError, depth);
    }

    const { stack, cause: nested, ...rest } = record;
    const fields = this.redactSensitiveData
      ? redactCauseFields(rest, this.sensitiveKeyPattern, new WeakSet([record]))
      : rest;
    return {
      ...fields,
      ...(this.includeStack && stack !== undefined ? { stack } : {}),
      ...(nested !== undefined
        ? { cause: this.serializeCause(nested, depth + 1) }
        : {}),
    };
  }

  /** Computes the metadata allowed in a public response. */
  private publicMetadata(
    error: BaseError,
  ): Readonly<Record<string, unknown>> | undefined {
    if (!this.includeMetadata) return undefined;
    return selectPublicMetadata(error, {
      publicMetadataKeys: this.publicMetadataKeys,
      exposeMetadata: this.exposeMetadata,
      redactSensitiveData: this.redactSensitiveData,
      sensitiveKeyPattern: this.sensitiveKeyPattern,
    });
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
