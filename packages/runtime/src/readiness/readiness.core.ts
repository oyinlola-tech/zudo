import type {
  ReadinessState,
  ReadinessCheck,
  ReadinessCheckFn,
  ReadinessCheckOptions,
  ReadinessTrackerState,
  ReadinessOptions,
} from "./readiness.type.js";

import {
  DEFAULT_CHECK_TIMEOUT,
  evaluateReadinessCheck,
} from "./readiness.check.js";

import { RuntimeStateError } from "../runtimeError/index.js";

/**
 * Tracks runtime readiness state.
 *
 * Two things pin readiness at `false` regardless of what the checks
 * say: the `shutting_down` state (entered by the runtime in `stop()`)
 * and a manual `markNotReady()`, which holds until `markReady()`.
 * Before, the next `runChecks()` — a `/ready` probe, typically —
 * overwrote both and sent traffic to an instance that was going away.
 */
export class ReadinessTracker {
  private state: ReadinessState = "not_ready";
  private readonly checks: Map<string, ReadinessCheck> = new Map();
  private readonly checkFns: Map<string, ReadinessCheckFn> = new Map();
  private readonly autoMarkReady: boolean;
  private readonly checkTimeout: number;
  private ready = false;
  private held = false;
  private reason?: string;
  private running: Promise<void> | undefined;

  public constructor(options: ReadinessOptions = {}) {
    this.autoMarkReady = options.autoMarkReady ?? true;
    this.checkTimeout = options.checkTimeout ?? DEFAULT_CHECK_TIMEOUT;

    for (const check of options.initialChecks ?? []) {
      this.registerCheck(check.name, check.check, { critical: check.critical });
    }
  }

  /**
   * Registers a readiness check.
   *
   * The check function is retained so it can be re-evaluated later by
   * `updateCheck(name)` or `runChecks()`. Registration does not run the
   * check: it starts out not-ready until it is first evaluated. Pass
   * `{ critical: false }` for a check that should be reported but must
   * not gate readiness.
   */
  public registerCheck(
    name: string,
    check: ReadinessCheckFn,
    options: ReadinessCheckOptions = {},
  ): void {
    this.checkFns.set(name, check);
    this.checks.set(name, {
      name,
      ready: false,
      critical: options.critical ?? true,
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

    if (!existed) {
      return false;
    }

    if (
      this.autoMarkReady &&
      this.checks.size === 0 &&
      this.state === "degraded" &&
      !this.held
    ) {
      // `degraded` is only ever entered from `ready` because a check
      // failed. Removing the last check leaves nothing failing, so the
      // tracker returns to ready — otherwise `evaluateReadiness()` (which
      // only acts when checks exist) left it stuck at `ready: false` while
      // the derived health, seeing no checks, reported `healthy`.
      this.markReady("All readiness checks removed.");
    } else {
      this.evaluateReadiness();
    }

    return true;
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

    await this.evaluate(name, fn);
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
          [...this.checkFns].map(([name, fn]) => this.evaluate(name, fn)),
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
   * Marks the runtime as ready and releases a `markNotReady()` hold.
   * Ignored while `shutting_down`; leave that state with `setState()`.
   */
  public markReady(reason?: string): void {
    if (this.state === "shutting_down") return;

    this.held = false;
    this.state = "ready";
    this.ready = true;
    this.reason = reason;
  }

  /**
   * Marks the runtime as not ready and holds it there: automatic
   * evaluation will not report ready again until `markReady()`.
   */
  public markNotReady(reason?: string): void {
    this.held = true;
    this.becomeNotReady(reason);
  }

  /**
   * Updates the readiness state.
   */
  public setState(state: ReadinessState, reason?: string): void {
    this.state = state;

    if (state === "ready") {
      this.ready = true;
      this.held = false;
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

  private async evaluate(name: string, fn: ReadinessCheckFn): Promise<void> {
    const critical = this.checks.get(name)?.critical ?? true;
    this.checks.set(
      name,
      await evaluateReadinessCheck(name, fn, this.checkTimeout, critical),
    );
  }

  private becomeNotReady(reason?: string): void {
    this.ready = false;
    this.reason = reason;

    if (this.state === "ready") {
      this.state = "degraded";
    }
  }

  /**
   * Evaluates overall readiness from the critical checks. Never acts
   * while shutting down or under a manual hold.
   */
  private evaluateReadiness(): void {
    if (!this.autoMarkReady || this.checks.size === 0) return;
    if (this.state === "shutting_down" || this.held) return;

    const failing = [...this.checks.values()]
      .filter((check) => check.critical && !check.ready)
      .map((check) => check.name);

    if (failing.length > 0) {
      this.becomeNotReady(`Readiness checks failing: ${failing.join(", ")}.`);
    } else if (!this.ready) {
      this.markReady("All readiness checks passed.");
    }
  }
}
