/**
 * @zudojs/http/httpStream — Stream error helpers.
 */

import { HttpStreamError as StreamError } from "@zudojs/errors";

export { StreamError };

export function createAbortError(): StreamError {
  return new StreamError("Stream operation was aborted.", {
    code: "STREAM_ABORTED",
  });
}

/**
 * Wraps a non-`Error` rejection value in a typed stream error.
 *
 * The original value is kept as `cause` — without it a rejected object
 * becomes the string `"[object Object]"` with no stack and nothing to debug
 * from.
 */
export function normalizeStreamError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  return new StreamError(String(error), { cause: error });
}

/**
 * Error raised when a stream exceeds its configured byte limit.
 */
export function createStreamLimitError(
  limit: number,
  received: number,
): StreamError {
  return new StreamError(
    `Stream exceeded the maximum allowed size of ${limit} bytes.`,
    {
      code: "STREAM_LIMIT_EXCEEDED",
      metadata: { limit, received },
    },
  );
}
