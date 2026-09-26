/**
 * @zudojs/lifecycle/executor
 *
 * Lifecycle executor — runs component hooks with timeout, retry, and error handling.
 */

import type { LifecyclePhase } from "@zudojs/constants";
import type { LifecycleRegistration } from "../lifecycleComponent/lifecycleComponent.type.js";
import type { LifecycleContext } from "../lifecycleContext/lifecycleContext.type.js";
import { withTimeout, withConcurrency } from "../lifecycleInternal/index.js";
import { getComponentMethod } from "../lifecyclePhase/index.js";
import {
  LifecycleComponentError,
  LifecycleTimeoutError,
} from "@zudojs/errors";
import type {
  ExecutionResult,
  LifecycleExecutorOptions,
  LifecycleRetryNotice,
} from "./lifecycleExecutor.type.js";
import {
  AbandonedHooks,
  isShutdownPhase,
  isStartupPhase,
} from "./lifecycleExecutor.abandoned.js";
import { calculateDelay, groupByPriority, sleep } from "./lifecycleExecutor.retry.js";

type Hook = (context: LifecycleContext) => Promise<void> | void;

/**
 * Executes lifecycle component hooks with timeout, retry, and concurrency support.
 *
 * Every invocation gets its own AbortSignal, derived from the run
 * signal and aborted when the component's `timeout` elapses, so a hook
 * that honours `context.signal` unwinds promptly. One that ignores it
 * keeps running and is tracked per component: before that component's
 * `stop()`/`dispose()` the executor waits for it — a drain that overran
 * its stop timeout is waited for until the global deadline, a startup
 * hook that ignored its timeout only for one more `timeout` — so hooks
 * of one component never overlap.
 */
export class LifecycleExecutor {
  private readonly abandoned = new AbandonedHooks();
  private readonly onRetry: ((notice: LifecycleRetryNotice) => void) | undefined;

  constructor(options: LifecycleExecutorOptions = {}) {
    this.onRetry = options.onRetry;
  }

  /**
   * Resolves once every hook abandoned by a timeout has settled — those
   * of one component when `id` is given, otherwise all of them.
   */
  public settleAbandoned(id?: string): Promise<void> {
    return this.abandoned.settle(id);
  }

  /**
   * Executes a single component hook.
   */
  public async execute(
    registration: LifecycleRegistration,
    phase: LifecyclePhase,
    context: LifecycleContext,
  ): Promise<ExecutionResult> {
    const { id } = registration;
    const hook = (registration.component as unknown as Record<string, unknown>)[
      getComponentMethod(phase)
    ];

    if (typeof hook !== "function") {
      return { id, phase, duration: 0, success: true };
    }

    if (isShutdownPhase(phase)) {
      await this.abandoned.settle(id, isShutdownPhase, context.signal);
    }

    const startTime = Date.now();
    const maxAttempts = 1 + (registration.retry.attempts ?? 0);
    let lastError: unknown;
    let timedOut = false;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (context.signal.aborted) {
        lastError ??= new LifecycleComponentError(id, phase, context.signal.reason);
        break;
      }

      const controller = new AbortController();
      let invocation: Promise<void> | undefined;

      try {
        await withTimeout(
          () => {
            invocation = this.invoke(registration, phase, hook as Hook, {
              ...context,
              signal: AbortSignal.any([context.signal, controller.signal]),
            });
            return invocation;
          },
          registration.timeout,
          id,
          phase,
        );

        return { id, phase, duration: Date.now() - startTime, success: true };
      } catch (error) {
        lastError = error;

        if (error instanceof LifecycleTimeoutError && invocation) {
          timedOut = true;
          controller.abort(error);
          this.abandoned.track(id, phase, invocation);
          break;
        }

        if (attempt < maxAttempts - 1) {
          const delay = calculateDelay(registration.retry, attempt);
          this.notifyRetry({ id, phase, attempt: attempt + 1, delay, error });
          await sleep(delay, context.signal);
        }
      }
    }

    return {
      id,
      phase,
      duration: Date.now() - startTime,
      error:
        lastError instanceof LifecycleComponentError
          ? lastError
          : new LifecycleComponentError(id, phase, lastError),
      success: false,
      ...(timedOut && { timedOut: true }),
    };
  }

  /**
   * Executes a stage of components, honouring priority as a barrier.
   *
   * The stage arrives already ordered by priority (descending for
   * startup, ascending for shutdown). Components sharing a priority run
   * together, limited by `concurrency`; the next priority group only
   * begins once the previous one has settled.
   */
  public async executeStage(
    registrations: readonly LifecycleRegistration[],
    phase: LifecyclePhase,
    context: LifecycleContext,
    concurrency: number,
  ): Promise<readonly ExecutionResult[]> {
    const results: ExecutionResult[] = [];

    for (const batch of groupByPriority(registrations)) {
      await withConcurrency(batch, concurrency, async (reg) => {
        results.push(await this.execute(reg, phase, context));
      });
    }

    return results;
  }

  private async invoke(
    registration: LifecycleRegistration,
    phase: LifecyclePhase,
    hook: Hook,
    context: LifecycleContext,
  ): Promise<void> {
    if (isShutdownPhase(phase)) {
      await this.abandoned.settle(registration.id, isStartupPhase, context.signal);

      // The wait was cut short by the component timeout (or the run
      // deadline): the earlier hook is still running, so this one must
      // not start on top of it.
      if (context.signal.aborted) {
        throw context.signal.reason instanceof Error
          ? context.signal.reason
          : new LifecycleComponentError(registration.id, phase, context.signal.reason);
      }
    }
    await hook.call(registration.component, context);
  }

  private notifyRetry(notice: LifecycleRetryNotice): void {
    try {
      this.onRetry?.(notice);
    } catch {
      // A listener must not break the retry loop.
    }
  }
}
