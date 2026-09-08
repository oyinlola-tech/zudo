import type {
  ReadinessState,
  ReadinessCheck,
  ReadinessCheckFn,
  ReadinessTrackerState,
  ReadinessOptions,
} from "./readiness.type.js";

import { RuntimeStateError } from "../runtimeError/index.js";

/**
 * How long a single readiness check may run before it counts as failed.
 *
 * Without a bound, one hanging probe hangs the readiness endpoint
 * indefinitely — a health check that never answers is worse than one
 * that answers "unhealthy".
 */
const DEFAULT_CHECK_TIMEOUT = 5_000;

/**
 * Tracks runtime readiness state.
 */
export class ReadinessTracker {
  private state: ReadinessState = "not_ready";
  private readonly checks: Map<string, ReadinessCheck> = new Map();
  private readonly checkFns: Map<string, ReadinessCheckFn> = new Map();
  private readonly autoMarkReady: boolean;
  private readonly checkTimeout: number;
  private ready = false;
  private reason?: string;
  private running: Promise<void> | undefined;

  public constructor(options: ReadinessOptions = {}) {
    this.autoMarkReady = options.autoMarkReady ?? true;
    this.checkTimeout = options.checkTimeout ?? DEFAULT_CHECK_TIMEOUT;

    if (options.initialChecks) {
      for (const check of options.initialChecks) {
        this.registerCheck(check.name, check.check);
      }
    }
  }

  /**
   * Registers a readiness check.
   *
   * The check function is retained so it can be re-evaluated later by
   * `updateCheck(name)` or `runChecks()`. Registration does not run the
   * check: it starts out not-ready until it is first evaluated.
   */
  public registerCheck(name: string, check: ReadinessCheckFn): void {
    this.checkFns.set(name, check);
    this.checks.set(name, {
      name,
      ready: false,
      lastCheckedAt: new Date(),
      durationMs: 0,
    });

    this.evaluateReadiness();
  }

  /**
   * Removes a readiness check.
   *
   * Returns whether a check with that name was registered.
   */
  public removeCheck(name: string): boolean {
    const existed = this.checks.delete(name);
    this.checkFns.delete(name);

    if (existed) {
      this.evaluateReadiness();
    }

    return existed;
  }

  /**
   * Evaluates a readiness check and records its result.
   *
   * Re-runs the function registered under `name` unless a replacement is
   * supplied, in which case the replacement is stored and used from then on.
   */
  public async updateCheck(
    name: string,
    check?: ReadinessCheckFn,
  ): Promise<void> {
    if (check !== undefined) {
      this.checkFns.set(name, check);
    }

    const fn = this.checkFns.get(name);

    if (fn === undefined) {
      throw new RuntimeStateError(
        `Readiness check "${name}" is not registered.`,
      );
    }

    await this.evaluateCheck(name, fn);
    this.evaluateReadiness();
  }

  /**
   * Re-evaluates every registered check.
   */
  public async runChecks(): Promise<void> {
    // Overlapping runs would interleave their writes into `checks`;
    // callers that arrive mid-run join the run already in flight.
    if (this.running) {
      return this.running;
    }

    this.running = (async () => {
      try {
        await Promise.all(
          [...this.checkFns].map(([name, fn]) => this.evaluateCheck(name, fn)),
        );

        this.evaluateReadiness();
      } finally {
        this.running = undefined;
      }
    })();

    return this.running;
  }

  /**
   * Whether any readiness check is registered.
   */
  public hasChecks(): boolean {
    return this.checkFns.size > 0;
  }

  /**
   * Runs a single check and records its result and duration.
   */
  private async evaluateCheck(
    name: string,
    fn: ReadinessCheckFn,
  ): Promise<void> {
    const startedAt = Date.now();

    try {
      const result = await this.withCheckTimeout(name, fn);

      this.checks.set(name, {
        name,
        ready: result,
        lastCheckedAt: new Date(),
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      this.checks.set(name, {
        name,
        ready: false,
        lastCheckedAt: new Date(),
        durationMs: Date.now() - startedAt,
        message:
          error instanceof Error
            ? `Check threw an error: ${error.message}`
            : "Check threw an error",
      });
    }
  }

  /**
   * Runs a check under a timeout, clearing the timer either way.
   */
  private async withCheckTimeout(
    name: string,
    fn: ReadinessCheckFn,
  ): Promise<boolean> {
    if (this.checkTimeout <= 0) {
      return fn();
    }

    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
      return await Promise.race([
        Promise.resolve(fn()),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            reject(
              new Error(
                `Readiness check "${name}" did not settle within ${this.checkTimeout}ms.`,
              ),
            );
          }, this.checkTimeout);

          timer.unref?.();
        }),
      ]);
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  }

  /**
   * Marks the runtime as ready.
   */
  public markReady(reason?: string): void {
    this.state = "ready";
    this.ready = true;
    this.reason = reason;
  }

  /**
   * Marks the runtime as not ready.
   */
  public markNotReady(reason?: string): void {
    this.ready = false;
    this.reason = reason;

    if (this.state === "ready") {
      this.state = "degraded";
    }
  }

  /**
   * Updates the readiness state.
   */
  public setState(state: ReadinessState, reason?: string): void {
    this.state = state;

    if (state === "ready") {
      this.ready = true;
    } else if (state === "not_ready" || state === "shutting_down") {
      this.ready = false;
    }

    this.reason = reason;
  }

  /**
   * Returns whether the runtime is ready.
   */
  public isReady(): boolean {
    return this.ready;
  }

  /**
   * Returns the current readiness state.
   */
  public getState(): ReadinessTrackerState {
    return Object.freeze({
      state: this.state,
      checks: Object.freeze(new Map(this.checks)),
      ready: this.ready,
      reason: this.reason,
    });
  }

  /**
   * Evaluates overall readiness based on registered checks.
   */
  private evaluateReadiness(): void {
    if (this.autoMarkReady && this.checks.size > 0) {
      const allReady = [...this.checks.values()].every((check) => check.ready);

      if (allReady && !this.ready) {
        this.markReady("All readiness checks passed.");
      } else if (!allReady && this.ready) {
        this.markNotReady("One or more readiness checks failed.");
      }
    }
  }
}
