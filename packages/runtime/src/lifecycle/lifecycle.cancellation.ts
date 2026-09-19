import type { Logger } from "@zudojs/logger";

import type { Module, ModuleContext } from "@zudojs/core";

/**
 * Tracks module hooks that are still running after their startup was
 * abandoned (by a startup timeout or a rollback).
 *
 * `Promise.race` cannot cancel the losing side, so a slow `onInitialize`
 * or `onReady` keeps running after the runtime has already reported a
 * failed start. Without this bookkeeping the late module came up with no
 * owner left to stop it: a timed-out boot reported `failed` and then
 * `stopped` while the module's server was listening.
 */
export class LifecycleCancellation {
  private cancelled = false;
  private readonly running = new Map<string, Promise<unknown>>();
  private readonly releases = new Set<Promise<void>>();

  /** Whether the current startup has been abandoned. */
  public get isCancelled(): boolean {
    return this.cancelled;
  }

  /** Abandons the current startup. Idempotent. */
  public cancel(): void {
    this.cancelled = true;
  }

  /** Clears the cancelled flag for a new startup. */
  public reset(): void {
    this.cancelled = false;
  }

  /** Whether a hook for `moduleId` is currently running. */
  public isRunning(moduleId: string): boolean {
    return this.running.has(moduleId);
  }

  /**
   * Records a running hook for `moduleId` until it settles.
   */
  public track<T>(moduleId: string, hook: Promise<T>): Promise<T> {
    this.running.set(moduleId, hook);

    const clear = (): void => {
      if (this.running.get(moduleId) === hook) {
        this.running.delete(moduleId);
      }
    };

    hook.then(clear, clear);

    return hook;
  }

  /**
   * Tears down a module whose hook completed after the startup was
   * abandoned: `onShutdown` when it had reached `onReady`, then
   * `onDestroy`. The teardown is tracked so {@link settle} waits for it.
   */
  public release(
    module: Module,
    context: ModuleContext,
    started: boolean,
    logger: Logger,
  ): Promise<void> {
    const release = releaseAbandonedModule(module, context, started, logger);

    this.releases.add(release);
    void release.finally(() => this.releases.delete(release));

    return release;
  }

  /**
   * Waits until every abandoned hook has settled and every late module
   * has been torn down.
   */
  public async settle(): Promise<void> {
    while (this.running.size > 0 || this.releases.size > 0) {
      await Promise.allSettled([...this.running.values(), ...this.releases]);
    }
  }
}

/**
 * Runs `onShutdown` (when the module had started) and `onDestroy` for a
 * module that finished a hook after its startup was abandoned.
 */
async function releaseAbandonedModule(
  module: Module,
  context: ModuleContext,
  started: boolean,
  logger: Logger,
): Promise<void> {
  logger.warn(
    `Module "${module.id}" finished a lifecycle hook after startup was abandoned; tearing it down.`,
  );

  if (started && module.onShutdown) {
    try {
      await module.onShutdown(context);
    } catch (error) {
      logger.error(`Abandoned module "${module.id}" failed to shut down.`, {
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (module.onDestroy) {
    try {
      await module.onDestroy(context);
    } catch (error) {
      logger.error(`Abandoned module "${module.id}" failed to destroy.`, {
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
