/**
 * Serialization limit errors: a payload nested too deep or too large.
 *
 * Both take `{ statusCode?, expose? }` so a guard can tell a client that
 * sent too much (an exposed 4xx) from a server that built too much (an
 * unexposed 500). Their messages hold only the observed value and the
 * limit, never the payload.
 */

import { ErrorCode } from "../../base/types/errorCode.type.js";
import { SerializationError } from "./serializationError.base.js";

/** Status and exposure overrides accepted by the limit errors. */
export interface SerializationLimitErrorOptions {
  readonly statusCode?: number;
  readonly expose?: boolean;
}

/**
 * Error thrown when maximum serialization depth is exceeded.
 *
 * By default over-deep data is a server-side data bug, so this is an
 * internal (500) error. Code that checks UNTRUSTED input (for example
 * `assertDepthWithinLimit` in `@zudojs/validation`) passes
 * `{ statusCode: 400, expose: true }`: too-deep client input is a client
 * error. The message holds only the two numbers, so it is safe to expose.
 */
export class SerializationDepthError extends SerializationError {
  public override readonly depth: number;
  public override readonly maxDepth: number;
  /** @deprecated Use `maxDepth`. */
  public readonly maxDepthValue: number;

  constructor(
    depth: number,
    maxDepth: number,
    options: SerializationLimitErrorOptions = {},
  ) {
    super(`Maximum serialization depth exceeded: ${depth} > ${maxDepth}`, {
      code: ErrorCode.MAX_DEPTH_EXCEEDED,
      depth,
      maxDepth,
      statusCode: options.statusCode ?? 500,
      expose: options.expose ?? false,
    });
    this.depth = depth;
    this.maxDepth = maxDepth;
    this.maxDepthValue = maxDepth;
  }
}

/**
 * Error thrown when a serialized payload exceeds the size limit.
 *
 * By default this is an exposed 413: the size guards that throw it
 * (`deserialize` in `@zudojs/serialization`, `assertSizeWithinLimit` in
 * `@zudojs/validation`) check UNTRUSTED input, and too much client input is
 * a client error. It used to be an unexposed 413, which
 * `serializePublicError` answered with "An unexpected error occurred.".
 * The message holds only the two sizes, never the payload, so it is safe to
 * expose. Code that checks a payload the server built itself passes
 * `{ statusCode: 500, expose: false }`, as `serialize` does.
 */
export class SerializationPayloadTooLargeError extends SerializationError {
  public override readonly size: number;
  public override readonly maxSize: number;
  /** @deprecated Use `size`. */
  public readonly payloadSize: number;
  /** @deprecated Use `maxSize`. */
  public readonly maxSizeValue: number;

  constructor(
    size: number,
    maxSize: number,
    options: SerializationLimitErrorOptions = {},
  ) {
    super(`Serialized payload too large: ${size} bytes (max: ${maxSize})`, {
      code: ErrorCode.PAYLOAD_TOO_LARGE,
      size,
      maxSize,
      statusCode: options.statusCode ?? 413,
      expose: options.expose ?? true,
    });
    this.size = size;
    this.maxSize = maxSize;
    this.payloadSize = size;
    this.maxSizeValue = maxSize;
  }
}
