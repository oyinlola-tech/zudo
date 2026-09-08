/**
 * Test application builder.
 *
 * Provides a simplified builder for creating test application
 * contexts without the full Runtime lifecycle.
 */

import type { Container } from "@zudojs/container";

import type { Logger } from "@zudojs/logger";

import { createStartedContainer } from "@zudojs/container";

import { createLogger } from "@zudojs/logger";

import { createCleanupManager } from "../cleanupManager/cleanupManager.core.js";

import { createTestClock } from "../testClock/testClock.core.js";

import type { CleanupManager } from "../cleanupManager/cleanupManager.core.js";

import type { TestClock } from "../testClock/testClock.core.js";

/**
 * Options for creating a test application.
 */
export interface TestApplicationOptions {
  readonly name?: string;
  readonly container?: Container;
  readonly logger?: Logger;
  readonly clock?: TestClock;
  readonly cleanup?: CleanupManager;
}

/**
 * A test application context.
 */
export interface TestApplication {
  readonly name: string;
  readonly container: Container;
  readonly logger: Logger;
  readonly clock: TestClock;
  readonly cleanup: CleanupManager;
  dispose: () => Promise<void>;
}

/**
 * Creates a test application context.
 *
 * @param options - Test application options.
 * @returns A TestApplication instance.
 *
 * @example
 * ```ts
 * const app = createTestApplication({ name: "user-service" });
 *
 * app.container.registerValue(token, implementation);
 * const service = app.container.resolve(token);
 *
 * await app.dispose();
 * ```
 */
export function createTestApplication(
  options: TestApplicationOptions = {},
): TestApplication {
  const name = options.name ?? "test-app";
  const container = options.container ?? createStartedContainer();
  const logger = options.logger ?? createLogger({ name });
  const clock = options.clock ?? createTestClock();
  const cleanup = options.cleanup ?? createCleanupManager();

  // Cleanups run in reverse registration order, so the logger is registered
  // first and therefore closed last: anything that logs while the container
  // disposes still has somewhere to write.
  cleanup.register(async () => {
    await logger.close();
  }, "logger-close");

  cleanup.register(async () => {
    await container.dispose();
  }, "container-dispose");

  const dispose = async (): Promise<void> => {
    await cleanup.dispose();
  };

  return {
    name,
    container,
    logger,
    clock,
    cleanup,
    dispose,
  };
}
