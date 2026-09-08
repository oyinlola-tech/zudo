import type { Logger } from "@zudojs/logger";

import type { EventBus } from "@zudojs/events";

import { createEvent } from "@zudojs/events";
import { publishRuntimeEvent } from "../runtimeEvents/index.js";

import { LifecycleManager } from "../lifecycle/index.js";

import type { LifecycleFailure } from "../lifecycle/lifecycle.type.js";

import {
  RuntimeStopError,
  RuntimeTimeoutError,
} from "../runtimeError/index.js";

/** Largest delay a timer can represent. */
const MAX_TIMER_DELAY = 2_147_483_647;

/**
 * Result of a shutdown attempt.
 */
export interface ShutdownResult {
  /** Modules that failed to stop or destroy cleanly. */
  readonly failures: readonly LifecycleFailure[];
  /** Whether the shutdown was cut short by the timeout. */
  readonly timedOut: boolean;
}

/**
 * Executes the shutdown sequence with timeout.
 *
 * The timeout timer is cleared as soon as the race settles: a timer left
 * armed after a clean shutdown holds the event loop open for its full
 * duration, which is why a stopped process could still take 30 seconds
 * to exit.
 *
 * Module failures are surfaced rather than logged and forgotten — a
 * deployment that failed to release its connections must not look
 * identical to one that shut down cleanly.
 */
export async function executeShutdown(
  lifecycle: LifecycleManager,
  runtimeId: string,
  eventBus: EventBus | undefined,
  logger: Logger,
  shutdownTimeout: number,
  emitEvents: boolean,
): Promise<ShutdownResult> {
  if (emitEvents && eventBus) {
    publishRuntimeEvent(
      eventBus,
      logger,
      createEvent({
        type: "runtime.shutdown.drain",
        payload: {
          runtimeId,
          timestamp: new Date(),
          state: "stopping",
        },
      }),
    );
  }

  logger.info("Initiating graceful shutdown.", { timeoutMs: shutdownTimeout });

  const stopPromise = performShutdown(lifecycle, logger);

  // The shutdown promise keeps running if the timeout wins; attach a
  // handler now so its eventual rejection is never unhandled.
  stopPromise.catch(() => {});

  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => {
        reject(new RuntimeTimeoutError("shutdown", shutdownTimeout));
      },
      Math.min(Math.max(0, shutdownTimeout), MAX_TIMER_DELAY),
    );

    timer.unref?.();
  });

  try {
    const failures = await Promise.race([stopPromise, timeoutPromise]);

    if (emitEvents && eventBus) {
      publishRuntimeEvent(
        eventBus,
        logger,
        createEvent({
          type: "runtime.shutdown.complete",
          payload: {
            runtimeId,
            timestamp: new Date(),
            state: "stopped",
          },
        }),
      );
    }

    if (failures.length > 0) {
      logger.warn("Shutdown completed with module failures.", {
        failedModules: failures.map((failure) => failure.moduleId),
      });
    } else {
      logger.info("Graceful shutdown complete.");
    }

    return { failures, timedOut: false };
  } catch (error) {
    const timedOut = error instanceof RuntimeTimeoutError;

    if (timedOut) {
      logger.error(
        "Shutdown timed out; abandoning remaining module teardown.",
        { timeoutMs: shutdownTimeout },
      );
    }

    if (emitEvents && eventBus) {
      publishRuntimeEvent(
        eventBus,
        logger,
        createEvent({
          type: "runtime.failed",
          payload: {
            runtimeId,
            timestamp: new Date(),
            state: "shutdown_failed",
            error: error instanceof Error ? error : new Error(String(error)),
            phase: "stop",
          },
        }),
      );
    }

    throw new RuntimeStopError(
      timedOut
        ? `Runtime shutdown exceeded ${shutdownTimeout}ms.`
        : "Runtime shutdown failed.",
      {
        phase: "stop",
        cause: error instanceof Error ? error : undefined,
      },
    );
  } finally {
    // Always clear: leaving this armed is what kept a cleanly stopped
    // process alive until the timeout elapsed.
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

/**
 * Performs the actual shutdown operations.
 *
 * Returns every module failure so the caller can decide what a partial
 * teardown means, rather than discarding them at the log line.
 */
async function performShutdown(
  lifecycle: LifecycleManager,
  logger: Logger,
): Promise<readonly LifecycleFailure[]> {
  const failures: LifecycleFailure[] = [];

  const stopResult = await lifecycle.stop();

  if (stopResult.failed.length > 0) {
    failures.push(...stopResult.failed);
    logger.warn("Some modules failed during shutdown.", {
      failedModules: stopResult.failed.map((f) => f.moduleId),
    });
  }

  logger.info("All modules stopped.", {
    modules: stopResult.succeeded,
    durationMs: stopResult.durationMs,
  });

  const destroyResult = await lifecycle.destroy();

  if (destroyResult.failed.length > 0) {
    failures.push(...destroyResult.failed);
    logger.warn("Some modules failed during destruction.", {
      failedModules: destroyResult.failed.map((f) => f.moduleId),
    });
  }

  logger.info("All modules destroyed.", {
    durationMs: destroyResult.durationMs,
  });

  return failures;
}
