/**
 * @zudojs/lifecycle/executor/abandoned
 *
 * Tracks hook invocations that outlived their timeout.
 */

import { LifecyclePhase } from "@zudojs/constants";

interface AbandonedHook {
  readonly phase: LifecyclePhase;
  readonly settled: Promise<unknown>;
}

/** Predicate over the phase of an abandoned hook. */
export type PhaseFilter = (phase: LifecyclePhase) => boolean;

/** True for `stop` and `dispose`. */
export function isShutdownPhase(phase: LifecyclePhase): boolean {
  return phase === LifecyclePhase.STOP || phase === LifecyclePhase.DISPOSE;
}

/** True for `initialize`, `start` and `ready`. */
export function isStartupPhase(phase: LifecyclePhase): boolean {
  return !isShutdownPhase(phase);
}

/**
 * Registry of hooks that are still running after their timeout fired.
 *
 * A timed-out hook cannot be cancelled, only abandoned. It is kept
 * here, per component, so that the component's next hook can wait for
 * it instead of overlapping it (three `listen()` calls on one port).
 */
export class AbandonedHooks {
  private readonly byComponent = new Map<string, Set<AbandonedHook>>();

  /** Starts tracking an invocation; it is forgotten once it settles. */
  public track(
    id: string,
    phase: LifecyclePhase,
    invocation: Promise<unknown>,
  ): void {
    const hook: AbandonedHook = {
      phase,
      settled: invocation.catch(() => undefined),
    };
    const set = this.byComponent.get(id) ?? new Set<AbandonedHook>();
    set.add(hook);
    this.byComponent.set(id, set);

    void hook.settled.finally(() => {
      set.delete(hook);
      if (set.size === 0 && this.byComponent.get(id) === set) {
        this.byComponent.delete(id);
      }
    });
  }

  /** Pending invocations of one component (or all), optionally by phase. */
  public pending(id?: string, filter?: PhaseFilter): readonly Promise<unknown>[] {
    const sets =
      id === undefined
        ? [...this.byComponent.values()]
        : [this.byComponent.get(id) ?? new Set<AbandonedHook>()];

    return sets
      .flatMap((set) => [...set])
      .filter((hook) => filter?.(hook.phase) ?? true)
      .map((hook) => hook.settled);
  }

  /**
   * Resolves once the selected invocations have settled, or as soon as
   * `signal` aborts (the shutdown deadline), whichever comes first.
   */
  public async settle(
    id?: string,
    filter?: PhaseFilter,
    signal?: AbortSignal,
  ): Promise<void> {
    for (;;) {
      const pending = this.pending(id, filter);
      if (pending.length === 0 || signal?.aborted) return;
      await raceAbort(Promise.allSettled(pending), signal);
    }
  }
}

function raceAbort(work: Promise<unknown>, signal?: AbortSignal): Promise<void> {
  if (signal === undefined) {
    return work.then(() => undefined);
  }

  return new Promise((resolve) => {
    const done = (): void => {
      signal.removeEventListener("abort", done);
      resolve();
    };
    signal.addEventListener("abort", done, { once: true });
    void work.then(done, done);
  });
}
