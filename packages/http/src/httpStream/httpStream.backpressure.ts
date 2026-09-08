/**
 * @zudojs/http/httpStream — Backpressure-aware write and drain helpers.
 */

import { Writable } from "node:stream";

import { StreamError, normalizeStreamError } from "./httpStream.error.js";

export async function writeToStream(
  stream: NodeJS.WritableStream,
  chunk: Buffer | Uint8Array | string,
): Promise<void> {
  const writable = stream as Writable;

  if (writable.destroyed) {
    throw new StreamError("Cannot write to a destroyed stream.", {
      code: "STREAM_DESTROYED",
    });
  }

  const accepted = writable.write(chunk);

  if (accepted) {
    return;
  }

  await waitForDrain(writable);
}

/**
 * Waits for a backpressured writable to drain.
 *
 * Control only reaches here because the write buffer is full — that is,
 * precisely when the peer is slow or already gone. A destroyed socket emits
 * `'close'` and never emits `'drain'`, so without the close listener this
 * promise never settles and the whole pipeline stays pinned holding its
 * buffers: the failure mode a slowloris-style client produces deliberately.
 */
export async function waitForDrain(
  stream: NodeJS.WritableStream,
): Promise<void> {
  const writable = stream as Writable;

  if (writable.destroyed) {
    throw new StreamError("Cannot write to a destroyed stream.", {
      code: "STREAM_DESTROYED",
    });
  }

  await new Promise<void>((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      writable.removeListener("drain", onDrain);

      writable.removeListener("error", onError);

      writable.removeListener("close", onClose);
    };

    function onDrain(): void {
      if (settled) {
        return;
      }

      settled = true;

      cleanup();

      resolve();
    }

    function onError(error: unknown): void {
      if (settled) {
        return;
      }

      settled = true;

      cleanup();

      reject(normalizeStreamError(error));
    }

    function onClose(): void {
      if (settled) {
        return;
      }

      settled = true;

      cleanup();

      reject(
        new StreamError("Stream was destroyed while awaiting drain.", {
          code: "STREAM_DESTROYED",
        }),
      );
    }

    writable.once("drain", onDrain);

    writable.once("error", onError);

    writable.once("close", onClose);
  });
}
