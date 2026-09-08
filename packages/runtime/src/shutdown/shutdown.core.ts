import type { Logger } from "@zudojs/logger";

import type { EventBus } from "@zudojs/events";

import { createEvent } from "@zudojs/events";
import { publishRuntimeEvent } from "../runtimeEvents/index.js";

import { LifecycleManager } from "../lifecycle/index.js";

import {
  RuntimeStopError,
  RuntimeTimeoutError,
} from "../runtimeError/index.js";

/**
 * Executes the shutdown sequence with timeout.
 */
export async function executeShutdown(
  lifecycle: LifecycleManager,
  runtimeId: string,
  eventBus: EventBus | undefined,
  logger: Logger,
  shutdownTimeout: number,
  emitEvents: boolean,
): Promise<void> {
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

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new RuntimeTimeoutError("shutdown", shutdownTimeout));
    }, shutdownTimeout);
  });

  try {
    await Promise.race([stopPromise, timeoutPromise]);

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

    logger.info("Graceful shutdown complete.");
  } catch (error) {
    if (error instanceof RuntimeTimeoutError) {
      logger.error("Shutdown timed out, forcing stop.");
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

    throw new RuntimeStopError("Runtime shutdown failed.", {
      phase: "stop",
      cause: error instanceof Error ? error : undefined,
    });
  }
}

/**
 * Performs the actual shutdown operations.
 */
async function performShutdown(
  lifecycle: LifecycleManager,
  logger: Logger,
): Promise<void> {
  // Stop modules
  const stopResult = await lifecycle.stop();

  if (stopResult.failed.length > 0) {
    logger.warn("Some modules failed during shutdown.", {
      failedModules: stopResult.failed.map((f) => f.moduleId),
    });
  }

  logger.info("All modules stopped.", {
    modules: stopResult.succeeded,
    durationMs: stopResult.durationMs,
  });

  // Destroy modules
  const destroyResult = await lifecycle.destroy();

  if (destroyResult.failed.length > 0) {
    logger.warn("Some modules failed during destruction.", {
      failedModules: destroyResult.failed.map((f) => f.moduleId),
    });
  }

  logger.info("All modules destroyed.", {
    durationMs: destroyResult.durationMs,
  });
}
