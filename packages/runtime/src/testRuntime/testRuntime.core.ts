/**
 * @zudojs/runtime — Test Runtime
 *
 * Provides a lightweight runtime for testing purposes with
 * mock infrastructure and easy lifecycle management.
 */

import type { Module } from "@zudojs/core";
import { createLogger } from "@zudojs/logger";
import { createContainer } from "@zudojs/container";
import { createEventBus } from "@zudojs/events";
import { DefaultRuntime } from "../runtime/runtime.core.js";
import type { RuntimeDependencies } from "../runtime/runtime.core.js";
import type { RuntimeOptions } from "../runtimeOptions/runtimeOptions.type.js";

/**
 * Creates a test runtime with mock infrastructure.
 *
 * @param modules - Optional modules to register.
 * @param options - Optional runtime options overrides.
 * @returns A runtime instance ready for testing.
 */
export function createTestRuntime(
  modules: Module[] = [],
  options: Partial<RuntimeOptions> = {},
): DefaultRuntime {
  const logger = createLogger({ name: "test-runtime" });
  const container = createContainer();
  const eventBus = createEventBus();

  const moduleMap = new Map<string, Module>();
  for (const module of modules) {
    moduleMap.set(module.id, module);
  }

  const dependencies: RuntimeDependencies = {
    modules: moduleMap,
    logger,
    container,
    eventBus,
  };

  const runtimeOptions: RuntimeOptions = {
    environment: "test",
    applicationName: "test-app",
    applicationVersion: "0.0.0-test",
    handleSignals: false,
    handleFatalErrors: false,
    shutdownTimeout: 5000,
    startupTimeout: 10000,
    emitEvents: false,
    ...options,
  };

  return new DefaultRuntime(dependencies, runtimeOptions);
}

/**
 * A module whose lifecycle hooks record their calls.
 */
export interface MockModule extends Module {
  /** How many times each hook ran, in call order. */
  readonly calls: {
    readonly onInitialize: number;
    readonly onReady: number;
    readonly onShutdown: number;
    readonly onDestroy: number;
  };
  /** Hook names in the order they were invoked. */
  readonly callOrder: readonly string[];
}

/**
 * Creates a mock module for testing.
 *
 * The hooks are plain counting functions rather than `vi.fn()`: this
 * module ships in the package, so it must not import a test runner —
 * `vitest` is a dev dependency consumers do not install, and `require`
 * is not available in an ESM package at all.
 *
 * @param id - Module identifier.
 * @param dependencies - Module dependencies.
 * @returns A mock module that records its lifecycle calls.
 */
export function createMockModule(
  id: string,
  dependencies: string[] = [],
): MockModule {
  const calls = {
    onInitialize: 0,
    onReady: 0,
    onShutdown: 0,
    onDestroy: 0,
  };
  const callOrder: string[] = [];

  const record = (hook: keyof typeof calls) => async (): Promise<void> => {
    calls[hook] += 1;
    callOrder.push(hook);
  };

  return {
    id,
    name: `Module ${id}`,
    dependencies,
    calls,
    callOrder,
    onInitialize: record("onInitialize"),
    onReady: record("onReady"),
    onShutdown: record("onShutdown"),
    onDestroy: record("onDestroy"),
  };
}

/**
 * Starts a test runtime, runs a callback, and stops it.
 *
 * @param fn - Async function to run with the started runtime.
 * @param modules - Optional modules to register.
 * @param options - Optional runtime options.
 */
export async function withTestRuntime<T>(
  fn: (runtime: DefaultRuntime) => Promise<T>,
  modules: Module[] = [],
  options: Partial<RuntimeOptions> = {},
): Promise<T> {
  const runtime = createTestRuntime(modules, options);
  await runtime.start();
  try {
    return await fn(runtime);
  } finally {
    await runtime.stop();
  }
}
