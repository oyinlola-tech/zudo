/**
 * Test application builder.
 *
 * Provides a simplified builder for creating test application
 * contexts without the full Runtime lifecycle.
 */

import type { Container } from "@zudojs/container";

import type { Logger } from "@zudojs/logger";

import { createStartedContainer } from "@zudojs/container";

import { createCleanupManager } from "../cleanupManager/cleanupManager.core.js";

import { createTestClock } from "../testClock/testClock.core.js";

import { createSpyLogger } from "../spyLogger/spyLogger.core.js";

import type { SpyLogger } from "../spyLogger/spyLogger.type.js";

import type { CleanupManager } from "../cleanupManager/cleanupManager.core.js";

import type { TestClock } from "../testClock/testClock.core.js";

/**
 * The instant a test application's default clock starts at:
 * 2026-01-01T00:00:00.000Z. Fixed, so a test that reads `app.clock.now`
 * gets the same answer on every run.
 */
export const DEFAULT_TEST_APPLICATION_TIME = Date.UTC(2026, 0, 1);

/**
 * Options for creating a test application.
 */
export interface TestApplicationOptions<TLogger extends Logger = Logger> {
  readonly name?: string;
  readonly container?: Container;

  /**
   * The application's logger. Defaults to a silent `createSpyLogger(name)`
   * that records every line in `app.logger.calls`. Pass a real logger
   * (`createLogger({ name })` from `@zudojs/logger`) to print instead.
   */
  readonly logger?: TLogger;

  /**
   * The application's clock. Defaults to a test clock pinned at
   * `startTime`.
   */
  readonly clock?: TestClock;

  /**
   * Where the default clock starts. Defaults to
   * {@link DEFAULT_TEST_APPLICATION_TIME}; pass `Date.now()` to start at
   * the wall-clock time. Ignored when `clock` is given.
   */
  readonly startTime?: Date | string | number;

  readonly cleanup?: CleanupManager;
}

/**
 * A test application context.
 */
export interface TestApplication<TLogger extends Logger = Logger> {
  readonly name: string;
  readonly container: Container;
  readonly logger: TLogger;
  readonly clock: TestClock;
  readonly cleanup: CleanupManager;
  dispose: () => Promise<void>;
}

/**
 * Creates a test application context.
 *
 * Deterministic and quiet by default: the logger is a recording
 * `SpyLogger` that prints nothing, and the clock is a test clock pinned at
 * {@link DEFAULT_TEST_APPLICATION_TIME}. Pass `logger` or `clock` (or
 * `startTime`) to use something else.
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
 * app.logger.calls;              // what the code under test logged
 * app.clock.now.toISOString();   // "2026-01-01T00:00:00.000Z"
 *
 * await app.dispose();
 * ```
 */
export function createTestApplication<TLogger extends Logger = SpyLogger>(
  options: TestApplicationOptions<TLogger> = {},
): TestApplication<TLogger> {
  const name = options.name ?? "test-app";
  const container = options.container ?? createStartedContainer();
  const logger = options.logger ?? (createSpyLogger(name) as Logger as TLogger);
  const clock =
    options.clock ??
    createTestClock(options.startTime ?? DEFAULT_TEST_APPLICATION_TIME);
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
