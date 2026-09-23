import type { Container } from "@zudojs/container";

import type { Logger } from "@zudojs/logger";

import type { LifecycleFailure } from "../lifecycle/lifecycle.type.js";

/**
 * The `moduleId` under which a container disposal failure is reported in
 * `status.shutdownFailures`. Parenthesised so it cannot collide with a
 * real module id.
 */
export const CONTAINER_SHUTDOWN_ID = "(container)";

/**
 * Disposes the runtime's container after its modules have shut down.
 *
 * Runs only when the runtime owns the container
 * (`disposeContainerOnStop: true`, which `createTestRuntime` sets). A
 * disposal failure does not fail the stop, matching module teardown
 * failures: it is logged and returned so it lands in
 * `status.shutdownFailures`.
 *
 * @returns The failure, or `undefined` when disposal succeeded.
 */
export async function disposeRuntimeContainer(
  container: Container,
  logger: Logger,
): Promise<LifecycleFailure | undefined> {
  const startedAt = Date.now();

  try {
    await container.dispose();
    return undefined;
  } catch (error) {
    const failure: LifecycleFailure = {
      moduleId: CONTAINER_SHUTDOWN_ID,
      phase: "destroy",
      error: error instanceof Error ? error : new Error(String(error)),
      durationMs: Date.now() - startedAt,
    };

    logger.error("Runtime container failed to dispose.", {
      errorMessage: failure.error.message,
    });

    return failure;
  }
}
