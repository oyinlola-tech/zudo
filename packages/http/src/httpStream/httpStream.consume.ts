/**
 * @zudojs/http/httpStream — Consume a readable stream via chunk callback.
 */

import { HttpStreamError as StreamError } from "@zudojs/errors";

import type { HTTPStreamOptions } from "./httpStream.types.js";

import {
  createAbortError,
  createStreamLimitError,
  normalizeStreamError,
} from "./httpStream.error.js";

import { HTTP_DEFAULTS } from "../httpConstants/http.constants.js";

import { getChunkSize } from "./httpStream.helper.js";

import { isReadableEnded } from "./httpStream.state.js";

import { destroyStream } from "./httpStream.destroy.js";

import {
  createSettleGuard,
  cleanupListeners,
  wireAbortSignal,
} from "./httpStream.eventHelper.js";

/**
 * Consumes a readable stream, handing each chunk to a callback.
 *
 * The total byte count is capped at `options.maxBytes`
 * (default `HTTP_DEFAULTS.BODY_LIMIT`). Without a cap any caller reading a
 * request body through this module rather than `httpBody` could be driven to
 * OOM by one unauthenticated chunked request.
 */
export async function consumeStream(
  stream: NodeJS.ReadableStream,
  onChunk: (chunk: unknown) => void,
  options: HTTPStreamOptions = {},
): Promise<void> {
  const signal = options.signal;

  if (signal?.aborted) {
    destroyStream(stream);

    throw createAbortError();
  }

  const maxBytes = options.maxBytes ?? HTTP_DEFAULTS.BODY_LIMIT;

  let total = 0;

  await new Promise<void>((resolve, reject) => {
    const guard = createSettleGuard();

    /*
     * Declared before any listener is attached: `finish` calls it, and a
     * stream implementation that emits synchronously during registration
     * would otherwise hit it in its temporal dead zone.
     */
    let cleanupFn: () => void = () => {};

    const finish = (error?: unknown) => {
      if (guard.settled()) return;

      guard.mark();

      cleanupFn();

      if (error) {
        /*
         * Removing the `data` listener does not pause a flowing stream, so a
         * consumer that rejected — a size limit, a validation failure — would
         * otherwise keep receiving the rest of the body into the process.
         */
        destroyStream(stream);

        reject(normalizeStreamError(error));
      } else {
        resolve();
      }
    };

    const onData = (chunk: unknown) => {
      try {
        total += getChunkSize(chunk);

        if (total > maxBytes) {
          finish(createStreamLimitError(maxBytes, total));

          return;
        }

        onChunk(chunk);
      } catch (error) {
        finish(error);
      }
    };

    const onEnd = () => {
      finish();
    };

    const onError = (error: unknown) => {
      finish(error);
    };

    const onClose = () => {
      if (!guard.settled() && !isReadableEnded(stream)) {
        finish(
          new StreamError("Stream closed before completion.", {
            code: "STREAM_CLOSED",
          }),
        );
      }
    };

    const onAbort = () => {
      finish(createAbortError());
    };

    stream.on("data", onData);
    stream.once("end", onEnd);
    stream.once("error", onError);
    stream.once("close", onClose);

    const removeAbort = wireAbortSignal(signal, onAbort);

    cleanupFn = () => {
      cleanupListeners(stream, [
        ["data", onData],
        ["end", onEnd],
        ["error", onError],
        ["close", onClose],
      ]);

      removeAbort();
    };
  });
}
