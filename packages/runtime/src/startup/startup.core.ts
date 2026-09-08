import type { Logger } from "@zudojs/logger";

import type { EventBus } from "@zudojs/events";

import { createEvent } from "@zudojs/events";
import { publishRuntimeEvent } from "../runtimeEvents/index.js";

import { LifecycleManager } from "../lifecycle/index.js";

import type { LifecycleFailure } from "../lifecycle/lifecycle.type.js";

import {
  RuntimeStartError,
  RuntimeTimeoutError,
} from "../runtimeError/index.js";

/** Largest delay a timer can represent. */
const MAX_TIMER_DELAY = 2_147_483_647;

/**
 * Runs the startup sequence under a bound.
 *
 * `startupTimeout` was validated as positive and then never enforced, so
 * a module whose `onInitialize` never settles hung the boot forever with
 * no diagnostic. The timer is cleared whichever side wins.
 */
async function withStartupTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  if (timeoutMs <= 0) {
    return operation;
  }

  // The startup promise keeps running if the timeout wins; attach a
  // handler now so its eventual rejection is never unhandled.
  operation.catch(() => {});

  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new RuntimeTimeoutError("startup", timeoutMs)),
      Math.min(timeoutMs, MAX_TIMER_DELAY),
    );

    timer.unref?.();
  });

  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

/**
 * Executes the startup sequence.
 */
export async function executeStartup(
  lifecycle: LifecycleManager,
  runtimeId: string,
  eventBus: EventBus | undefined,
  logger: Logger,
  emitEvents: boolean,
  startupTimeout = 0,
): Promise<void> {
  return withStartupTimeout(
    runStartup(lifecycle, runtimeId, eventBus, logger, emitEvents),
    startupTimeout,
  );
}

/**
 * Runs the startup sequence.
 */
async function runStartup(
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
): Promise<readonly LifecycleFailure[]> {
  logger.info("Rolling back module startup.");

  const failures = await lifecycle.rollback();

  logger.info("Module rollback complete.", {
    failedModules: failures.map((failure) => failure.moduleId),
  });

  return failures;
}
