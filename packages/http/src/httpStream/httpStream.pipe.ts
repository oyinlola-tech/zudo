/**
 * @zudojs/http/httpStream — Pipe and copy streams between source and destination.
 */

import { HttpStreamError as StreamError } from "@zudojs/errors";
import type {
  StreamPipeOptions,
  StreamResult,
  HTTPStreamOptions,
} from "./httpStream.types.js";
import {
  createAbortError,
  createStreamLimitError,
  normalizeStreamError,
} from "./httpStream.error.js";
import { isReadableEnded, isWritableFinished } from "./httpStream.state.js";
import { destroyStream } from "./httpStream.destroy.js";
import { getChunkSize } from "./httpStream.helper.js";
import {
  createSettleGuard,
  cleanupListeners,
  wireAbortSignal,
} from "./httpStream.eventHelper.js";

export async function pipeStream(
  source: NodeJS.ReadableStream,
  destination: NodeJS.WritableStream,
  options: StreamPipeOptions = {},
): Promise<StreamResult> {
  const signal = options.signal;

  if (signal?.aborted) {
    destroyStream(source);
    throw createAbortError();
  }

  const maxBytes = options.maxBytes ?? Number.POSITIVE_INFINITY;

  let bytes = 0;
  let chunks = 0;

  return new Promise<StreamResult>((resolve, reject) => {
    const guard = createSettleGuard();

    /* Defined before any listener is attached; see consumeStream. */
    let cleanupFn: () => void = () => {};

    const finish = (error?: unknown) => {
      if (guard.settled()) return;
      guard.mark();
      cleanupFn();

      if (error) {
        reject(normalizeStreamError(error));
      } else {
        resolve({ bytes });
      }
    };

    const onData = (chunk: unknown) => {
      chunks += 1;
      bytes += getChunkSize(chunk);

      if (bytes > maxBytes) {
        destroyStream(source);
        destroyStream(destination);
        finish(createStreamLimitError(maxBytes, bytes));
      }
    };

    /*
     * `end` is driven from here alone — the pipe below is created with
     * `{ end: false }` — so the destination is never ended twice.
     */
    const onEnd = () => {
      if (options.end === false) {
        finish();
        return;
      }

      if (!isWritableFinished(destination)) {
        try {
          destination.end();
        } catch (error) {
          finish(error);
        }
        return;
      }

      finish();
    };

    const onFinish = () => {
      finish();
    };

    const onSourceError = (error: unknown) => {
      destroyStream(destination);
      finish(error);
    };

    const onDestinationError = (error: unknown) => {
      destroyStream(source);
      finish(error);
    };

    const onSourceClose = () => {
      if (!isReadableEnded(source) && !guard.settled()) {
        finish(
          new StreamError("Source stream closed before completion.", {
            code: "STREAM_SOURCE_CLOSED",
          }),
        );
      }
    };

    const onAbort = () => {
      destroyStream(source);
      destroyStream(destination);
      finish(createAbortError());
    };

    source.on("data", onData);
    source.once("end", onEnd);
    source.once("error", onSourceError);
    source.once("close", onSourceClose);
    destination.once("error", onDestinationError);
    destination.once("finish", onFinish);

    const removeAbort = wireAbortSignal(signal, onAbort);

    cleanupFn = () => {
      cleanupListeners(source, [
        ["data", onData],
        ["end", onEnd],
        ["error", onSourceError],
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
      finish(error);
    }
  });
}

export async function copyStream(
  source: NodeJS.ReadableStream,
  destination: NodeJS.WritableStream,
  options: HTTPStreamOptions = {},
): Promise<StreamResult> {
  return pipeStream(source, destination, options);
}
