import type { ConfigurationManager, Module, ModuleContext } from "@zudojs/core";

/**
 * Lifecycle hook phases for modules.
 */
export type LifecyclePhase = "initialize" | "start" | "stop" | "destroy";

/**
 * Result of a lifecycle operation.
 */
export interface LifecycleResult {
  readonly phase: LifecyclePhase;
  readonly succeeded: readonly string[];
  readonly failed: readonly LifecycleFailure[];
  readonly durationMs: number;
}

/**
 * Failure information for a lifecycle operation.
 */
export interface LifecycleFailure {
  readonly moduleId: string;
  readonly phase: LifecyclePhase;
  readonly error: Error;
  readonly durationMs: number;
}

/**
 * Context passed to lifecycle hooks.
 */
export interface LifecycleContext {
  readonly runtimeId: string;
  readonly environment: string;
  readonly phase: LifecyclePhase;
  readonly moduleId: string;
  readonly container: import("@zudojs/container").Container;
  readonly logger: import("@zudojs/logger").Logger;
}

/**
 * A module entry in the lifecycle manager.
 */
export interface ManagedModule {
  readonly module: Module;
  readonly depth: number;
  readonly dependencies: readonly string[];
}

/**
 * Framework services made available to modules through their
 * {@link ModuleContext}.
 *
 * Both are optional so a runtime can be started without a configuration
 * layer, but a module that reaches for a service the host did not supply
 * gets a clear error rather than a silently empty object.
 */
export interface ModuleContextServices {
  /**
   * Configuration manager backing `getConfiguration`, `getConfig` and
   * `requireConfig`. Defaults to an empty, uninitialized manager.
   */
  readonly configuration?: ConfigurationManager;

  /**
   * Application context exposed as `context.application`.
   *
   * `ApplicationContext` is not part of `@zudojs/core`'s published entry
   * points, so the runtime cannot construct one itself; a host that has an
   * application context passes it in here.
   */
  readonly application?: ModuleContext["application"];
}

/**
 * Options for lifecycle management.
 */
export interface LifecycleManagerOptions {
  readonly shutdownTimeout?: number;
  readonly continueOnFailure?: boolean;
  /**
   * Whether modules at the same dependency depth are initialized
   * concurrently. Defaults to `false`. Modules within a depth group do
   * not depend on one another, but enabling this surfaces any ordering
   * a module assumed without declaring.
   */
  readonly parallelInitialization?: boolean;
}
