/**
 * Last-resort reporting for failures nobody else can receive.
 *
 * A worker's poll failure or a throwing event listener has no caller to
 * reject. They used to go to `console.error`, bypassing structured logging
 * and redaction. They now go to the configured logger's `error`, and without
 * one to `process.emitWarning`, which Node prints once and applications can
 * intercept with `process.on("warning")`.
 *
 * @module queue/queue.report
 */

import type { QueueLogger } from "./queue.type.js";

/**
 * Report an error that has no caller to receive it.
 *
 * @param message - What failed.
 * @param error - The failure.
 * @param logger - The configured logger, if any.
 */
export function reportQueueError(
  message: string,
  error: unknown,
  logger?: QueueLogger,
): void {
  if (logger?.error) {
    logger.error(message, { error });
    return;
  }
  process.emitWarning(
    error instanceof Error ? error : new Error(String(error)),
    { type: "ZudoQueueWarning", detail: message },
  );
}
