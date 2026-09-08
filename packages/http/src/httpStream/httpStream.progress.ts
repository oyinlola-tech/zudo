/**
 * @zudojs/http/httpStream — Pipe streams with progress reporting.
 */

import { HttpStreamError as StreamError } from "@zudojs/errors";

import type {
  StreamPipeOptions,
  StreamResult,
  StreamProgressHandler,
} from "./httpStream.types.js";

import {
  createAbortError,
  createStreamLimitError,
  normalizeStreamError,
} from "./httpStream.error.js";

import { destroyStream } from "./httpStream.destroy.js";

import { getChunkSize } from "./httpStream.helper.js";

import { isReadableEnded, isWritableFinished } from "./httpStream.state.js";

import {
  createSettleGuard,
  cleanupListeners,
  wireAbortSignal,
} from "./httpStream.eventHelper.js";

export async function pipeStreamWithProgress(
  source: NodeJS.ReadableStream,
  destination: NodeJS.WritableStream,
  onProgress: StreamProgressHandler,
  options: StreamPipeOptions = {},
): Promise<StreamResult> {
  const signal = options.signal;

  if (signal?.aborted) {
    destroyStream(source);
    destroyStream(destination);

    throw createAbortError();
  }

  const maxBytes = options.maxBytes ?? Number.POSITIVE_INFINITY;

  let bytes = 0;
  let chunks = 0;

  return new Promise<StreamResult>((resolve, reject) => {
    const guard = createSettleGuard();

    /* Defined before any listener is attached; see consumeStream. */
    let cleanupFn: () => void = () => {};

    const fail = (error: unknown) => {
      if (guard.settled()) return;

      guard.mark();

      cleanupFn();

      reject(normalizeStreamError(error));
    };

    const complete = () => {
      if (guard.settled()) return;

      guard.mark();

      cleanupFn();

      resolve({ bytes });
    };

    const onData = (chunk: unknown) => {
      try {
        chunks += 1;
        bytes += getChunkSize(chunk);

        if (bytes > maxBytes) {
          destroyStream(source);
          destroyStream(destination);
          fail(createStreamLimitError(maxBytes, bytes));

          return;
        }

        onProgress({ bytes, chunks });
      } catch (error) {
        destroyStream(source);
        destroyStream(destination);
        fail(error);
      }
    };

    /*
     * `end` is driven from here alone — the pipe below is created with
     * `{ end: false }` — so the destination is never ended twice.
     */
    const onEnd = () => {
      if (options.end === false) {
        complete();
        return;
      }

      if (!isWritableFinished(destination)) {
        try {
          destination.end();
        } catch (error) {
          fail(error);
        }

        return;
      }

      complete();
    };

    /*
     * A client that aborts mid-upload makes Node destroy the request stream
     * and emit only `'close'` — neither `'end'` nor `'error'`. Without this
     * listener the returned promise never settles: every aborted transfer
     * leaks a pending promise, five listeners, and the buffers they close
     * over, and any handler awaiting it hangs forever.
     */
    const onSourceClose = () => {
      if (!guard.settled() && !isReadableEnded(source)) {
        fail(
          new StreamError("Source stream closed before completion.", {
            code: "STREAM_SOURCE_CLOSED",
          }),
        );
      }
    };

    const onFinish = () => {
      complete();
    };

    const onError = (error: unknown) => {
      destroyStream(destination);
      fail(error);
    };

    const onDestinationError = (error: unknown) => {
      destroyStream(source);
      fail(error);
    };

    const onAbort = () => {
      destroyStream(source);
      destroyStream(destination);
      fail(createAbortError());
    };

    source.on("data", onData);
    source.once("end", onEnd);
    source.once("error", onError);
    source.once("close", onSourceClose);

    destination.once("error", onDestinationError);
    destination.once("finish", onFinish);

    const removeAbort = wireAbortSignal(signal, onAbort);

    cleanupFn = () => {
      cleanupListeners(source, [
        ["data", onData],
        ["end", onEnd],
        ["error", onError],
        ["close", onSourceClose],
      ]);

      cleanupListeners(destination, [
        ["error", onDestinationError],
        ["finish", onFinish],
      ]);

      removeAbort();
    };

    try {
      source.pipe(destination, { end: false });
    } catch (error) {
      fail(error);
    }
  });
}
