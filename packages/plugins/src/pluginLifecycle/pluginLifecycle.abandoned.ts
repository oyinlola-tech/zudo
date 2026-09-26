import type { RegisteredPlugin } from "../pluginRegistry/pluginRegistry.core.js";

/** A hook still running after its timeout fired. */
interface AbandonedHook {
  readonly phase: string;
  readonly hook: Promise<void>;
}

/** Outcome of waiting for an abandoned hook. */
export type AbandonedOutcome = "resolved" | "rejected" | "pending";

/**
 * Tracks lifecycle hooks abandoned by `hookTimeout`.
 *
 * `Promise.race` cannot cancel the losing hook, so a plugin whose
 * `start()` timed out kept starting after rollback had already disposed
 * it, and its `stop()` never ran: the port it went on to open had no
 * owner. Recording the hook lets teardown wait for it and stop the
 * plugin once it has actually started.
 */
export class AbandonedHooks {
  readonly #hooks = new Map<RegisteredPlugin, AbandonedHook>();

  /** Records a hook that outlived its timeout. */
  record(registered: RegisteredPlugin, phase: string, hook: Promise<void>): void {
    this.#hooks.set(registered, { phase, hook });
  }

  /**
   * Takes the plugin's abandoned hook, if any, and waits up to
   * `graceMs` for it to settle.
   *
   * @returns The phase and outcome, plus the hook itself so a caller can
   *   still react when it settles after the grace period.
   */
  async take(
    registered: RegisteredPlugin,
    graceMs: number,
  ): Promise<
    | { phase: string; outcome: AbandonedOutcome; hook: Promise<void> }
    | undefined
  > {
    const entry = this.#hooks.get(registered);
    if (entry === undefined) return undefined;
    this.#hooks.delete(registered);

    let timer: ReturnType<typeof setTimeout> | undefined;
    // Ref'd on purpose: the caller awaits this wait, and an unref'd timer
    // let Node exit mid-await (code 13) when the abandoned hook never
    // settles. It is cleared as soon as the race is decided.
    const pending = new Promise<AbandonedOutcome>((resolve) => {
      timer = setTimeout(() => resolve("pending"), graceMs);
    });

    try {
      const outcome = await Promise.race([
        entry.hook.then(
          (): AbandonedOutcome => "resolved",
          (): AbandonedOutcome => "rejected",
        ),
        pending,
      ]);
      return { phase: entry.phase, outcome, hook: entry.hook };
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
}
