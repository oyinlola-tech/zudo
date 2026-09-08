import type { Logger } from "@zudojs/logger";

import type { EventBus } from "@zudojs/events";

import { createEvent } from "@zudojs/events";
import { publishRuntimeEvent } from "../runtimeEvents/index.js";

import { LifecycleManager } from "../lifecycle/index.js";

import { RuntimeStartError } from "../runtimeError/index.js";

/**
 * Executes the startup sequence.
 */
export async function executeStartup(
  lifecycle: LifecycleManager,
  runtimeId: string,
  eventBus: EventBus | undefined,
  logger: Logger,
  emitEvents: boolean,
): Promise<void> {
  // Initialize modules
  if (emitEvents && eventBus) {
    publishRuntimeEvent(
      eventBus,
      logger,
      createEvent({
        type: "runtime.module.initializing",
        payload: {
          runtimeId,
          timestamp: new Date(),
          state: "initializing",
        },
      }),
    );
  }

  const initResult = await lifecycle.initialize();

  if (initResult.failed.length > 0) {
    const failure = initResult.failed[0]!;

    if (emitEvents && eventBus) {
      publishRuntimeEvent(
        eventBus,
        logger,
        createEvent({
          type: "runtime.module.failed",
          payload: {
            runtimeId,
            state: "initialization_failed",
            timestamp: new Date(),
            error: failure.error,
            phase: "initialize",
            failedModuleId: failure.moduleId,
          },
        }),
      );
    }

    throw new RuntimeStartError(
      `Module "${failure.moduleId}" failed during initialization.`,
      {
        phase: "initialize",
        failedModuleId: failure.moduleId,
        cause: failure.error,
      },
    );
  }

  logger.info("All modules initialized.", {
    modules: initResult.succeeded,
    durationMs: initResult.durationMs,
  });

  // Start modules
  if (emitEvents && eventBus) {
    publishRuntimeEvent(
      eventBus,
      logger,
      createEvent({
        type: "runtime.module.starting",
        payload: {
          runtimeId,
          timestamp: new Date(),
          state: "starting",
        },
      }),
    );
  }

  const startResult = await lifecycle.start();

  if (startResult.failed.length > 0) {
    const failure = startResult.failed[0]!;

    if (emitEvents && eventBus) {
      publishRuntimeEvent(
        eventBus,
        logger,
        createEvent({
          type: "runtime.module.failed",
          payload: {
            runtimeId,
            state: "startup_failed",
            timestamp: new Date(),
            error: failure.error,
            phase: "start",
            failedModuleId: failure.moduleId,
          },
        }),
      );
    }

    throw new RuntimeStartError(
      `Module "${failure.moduleId}" failed during startup.`,
      {
        phase: "start",
        failedModuleId: failure.moduleId,
        cause: failure.error,
      },
    );
  }

  logger.info("All modules started.", {
    modules: startResult.succeeded,
    durationMs: startResult.durationMs,
  });
}

/**
 * Rolls back a failed startup.
 */
export async function rollbackStartup(
  lifecycle: LifecycleManager,
  logger: Logger,
): Promise<void> {
  logger.info("Rolling back module startup.");

  await lifecycle.rollback();

  logger.info("Module rollback complete.");
}
