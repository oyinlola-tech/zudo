/**
 * Specific serialization error classes.
 */

import { ErrorCode } from "../../base/types/errorCode.type.js";
import { SerializationError } from "./serializationError.base.js";

/** Error thrown when serialization fails. */
export class SerializeError extends SerializationError {
  constructor(
    message: string,
    options: { format?: string; cause?: unknown } = {},
  ) {
    super(message, {
      code: ErrorCode.SERIALIZATION_FAILED,
      format: options.format,
      cause: options.cause,
    });
  }
}

/**
 * Error thrown when deserialization fails.
 *
 * Malformed serialized input is a client/input problem, so this is a 400
 * that may be exposed.
 */
export class DeserializeError extends SerializationError {
  constructor(
    message: string,
    options: { format?: string; cause?: unknown } = {},
  ) {
    super(message, {
      code: ErrorCode.DESERIALIZATION_FAILED,
      format: options.format,
      cause: options.cause,
      statusCode: 400,
      expose: true,
    });
  }
}

/** Error thrown when a serialization format is not supported. */
export class UnsupportedSerializationFormatError extends SerializationError {
  constructor(format: string) {
    super(`Unsupported serialization format: "${format}"`, {
      code: ErrorCode.UNSUPPORTED_FORMAT,
      format,
      statusCode: 400,
      expose: true,
    });
  }
}

/** Error thrown when a named serializer is not found in the registry. */
export class SerializerNotFoundError extends SerializationError {
  public override readonly serializerName: string;

  constructor(name: string) {
    super(`No serializer registered with name: "${name}"`, {
      code: ErrorCode.SERIALIZER_NOT_FOUND,
      serializerName: name,
      statusCode: 404,
      expose: true,
    });
    this.serializerName = name;
  }
}

/**
 * Error thrown when a circular reference is detected during serialization.
 *
 * Circular data is a server-side data bug, so this is an internal (500) error.
 */
export class CircularReferenceError extends SerializationError {
  public readonly circularPath: string;

  constructor(path = "root") {
    super(`Circular reference detected at "${path}"`, {
      code: ErrorCode.CIRCULAR_REFERENCE,
      statusCode: 500,
      expose: false,
      metadata: { circularPath: path },
    });
    this.circularPath = path;
  }
}

/**
 * Error thrown when maximum serialization depth is exceeded.
 *
 * Over-deep data is a server-side data bug, so this is an internal (500) error.
 */
export class SerializationDepthError extends SerializationError {
  public override readonly depth: number;
  public override readonly maxDepth: number;
  /** @deprecated Use `maxDepth`. */
  public readonly maxDepthValue: number;

  constructor(depth: number, maxDepth: number) {
    super(`Maximum serialization depth exceeded: ${depth} > ${maxDepth}`, {
      code: ErrorCode.MAX_DEPTH_EXCEEDED,
      depth,
      maxDepth,
      statusCode: 500,
      expose: false,
    });
    this.depth = depth;
    this.maxDepth = maxDepth;
    this.maxDepthValue = maxDepth;
  }
}

/** Error thrown when a serialized payload exceeds the size limit. */
export class SerializationPayloadTooLargeError extends SerializationError {
  public override readonly size: number;
  public override readonly maxSize: number;
  /** @deprecated Use `size`. */
  public readonly payloadSize: number;
  /** @deprecated Use `maxSize`. */
  public readonly maxSizeValue: number;

  constructor(size: number, maxSize: number) {
    super(`Serialized payload too large: ${size} bytes (max: ${maxSize})`, {
      code: ErrorCode.PAYLOAD_TOO_LARGE,
      size,
      maxSize,
      statusCode: 413,
      expose: false,
    });
    this.size = size;
    this.maxSize = maxSize;
    this.payloadSize = size;
    this.maxSizeValue = maxSize;
  }
}

/** Error thrown when serialized data is invalid or malformed. */
export class InvalidSerializedDataError extends SerializationError {
  constructor(
    message: string,
    options: { format?: string; cause?: unknown } = {},
  ) {
    super(message, {
      code: ErrorCode.INVALID_SERIALIZED_DATA,
      format: options.format,
      cause: options.cause,
      statusCode: 400,
      expose: true,
    });
  }
}

/** Error thrown when a type transformer fails. */
export class TransformerError extends SerializationError {
  public override readonly transformerType: string;

  constructor(
    type: string,
    message: string,
    options: { cause?: unknown } = {},
  ) {
    super(`Transformer error (${type}): ${message}`, {
      code: ErrorCode.TRANSFORMER_ERROR,
      transformerType: type,
      cause: options.cause,
    });
    this.transformerType = type;
  }
}

/** Error thrown when a type transformer is not found. */
export class TransformerNotFoundError extends SerializationError {
  public override readonly transformerType: string;

  constructor(type: string) {
    super(`No transformer registered for type: "${type}"`, {
      code: ErrorCode.TRANSFORMER_NOT_FOUND,
      transformerType: type,
      statusCode: 404,
      expose: true,
    });
    this.transformerType = type;
  }
}
