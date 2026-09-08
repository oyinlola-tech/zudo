/**
 * Error serializer factory and utility functions.
 */

import type { BaseError } from "../base/core/baseError.core.js";
import { normalizeUnknownToBaseError } from "../base/utils/baseError.utils.js";
import { ErrorSerializer } from "./errorSerializer.core.js";
import type {
  ErrorSerializerOptions,
  PublicErrorResponse,
  InternalErrorResponse,
} from "./errorSerializer.types.js";

export type {
  ErrorSerializerOptions,
  PublicErrorResponse,
  InternalErrorResponse,
} from "./errorSerializer.types.js";

/** Creates an ErrorSerializer instance. */
export function createErrorSerializer(
  options: ErrorSerializerOptions = {},
): ErrorSerializer {
  return new ErrorSerializer(options);
}

/** Serializes a BaseError for internal use. */
export function serializeError(
  error: BaseError,
  options: ErrorSerializerOptions = {},
): InternalErrorResponse {
  return new ErrorSerializer(options).serialize(error);
}

/** Serializes a BaseError for public API responses. */
export function serializePublicError(
  error: BaseError,
  options: ErrorSerializerOptions = {},
): PublicErrorResponse {
  return new ErrorSerializer(options).serializePublic(error);
}

/** Converts an unknown thrown value into a BaseError. */
export function normalizeUnknownError(value: unknown): BaseError {
  return normalizeUnknownToBaseError(value);
}
