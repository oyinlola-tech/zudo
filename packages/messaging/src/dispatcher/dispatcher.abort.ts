/**
 * Turning an aborted dispatch signal into a failed dispatch.
 *
 * A timeout rejected the dispatch as soon as it fired, but a caller's abort
 * only stopped the *next* handler from starting: when it arrived during the
 * last or only handler, and that handler returned normally, the dispatch was
 * reported as `success: true`.
 *
 * @module dispatcher/dispatcher.abort
 */

import {
  MessageDispatchAbortedError,
  MessageTimeoutError,
} from "@zudojs/errors";

import type { Message } from "../message/messageType.type.js";

/** A rejection armed on a signal, and the means to disarm it. */
export interface AbortRejection {
  /** Rejects once the signal aborts; never resolves. */
  readonly promise: Promise<never>;
  /** Detaches from the signal and cancels a pending rejection. */
  readonly dispose: () => void;
}

/**
 * The error a dispatch fails with once `signal` has aborted.
 *
 * A timeout aborts with its own {@link MessageTimeoutError}, which is kept;
 * any other abort is reported as {@link MessageDispatchAbortedError}.
 */
export function abortErrorFor(signal: AbortSignal, message: Message): Error {
  if (signal.reason instanceof MessageTimeoutError) return signal.reason;
  return new MessageDispatchAbortedError(undefined, {
    messageType: message.type,
    messageId: message.id,
  });
}

/** Throws the dispatch's abort error when `signal` has aborted. */
export function assertDispatchNotAborted(
  signal: AbortSignal,
  message: Message,
): void {
  if (signal.aborted) throw abortErrorFor(signal, message);
}

/**
 * A promise that rejects when `signal` aborts, so a dispatch settles
 * promptly — as it does on a timeout — even while a handler that ignores its
 * signal is still running.
 *
 * The rejection waits one macrotask. A handler that aborts and then returns
 * synchronously has its result recorded first, so `handlerResults` still
 * lists every handler that finished.
 */
export function abortRejection(
  signal: AbortSignal,
  message: Message,
): AbortRejection {
  let pending: ReturnType<typeof setImmediate> | undefined;
  let onAbort: (() => void) | undefined;

  const promise = new Promise<never>((_resolve, reject) => {
    onAbort = (): void => {
      pending = setImmediate(() => reject(abortErrorFor(signal, message)));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
  // The race owns this promise's outcome; a rejection that loses the race
  // must not surface as unhandled.
  promise.catch(() => {});

  return {
    promise,
    dispose: () => {
      if (onAbort) signal.removeEventListener("abort", onAbort);
      if (pending !== undefined) clearImmediate(pending);
    },
  };
}
