/**
 * Cool-off window for a provider that is failing.
 *
 * @module featureFlags/featureFlags.cooloff
 */

/** Default cool-off after a provider failure, in ms. */
export const DEFAULT_PROVIDER_COOLOFF_MS = 5_000;

/** Tracks whether a failing provider should be probed again yet. */
export interface ProviderCooloff {
  /** Whether the provider is inside its cool-off window and must not be called. */
  active(): boolean;
  /** Records a failed provider call, opening a new window. */
  recordFailure(): void;
  /** Records a successful provider call, closing any open window. */
  recordSuccess(): void;
}

/**
 * Create a cool-off gate.
 *
 * Without one, every evaluation against an unreachable store re-ran
 * `getAll()` and `get(key)` — two remote round trips per call, each one
 * waiting out its own timeout, for as long as the outage lasted. After a
 * failure the provider is probed at most once per `cooloffMs`; a success
 * clears the window immediately. `cooloffMs <= 0` disables the gate.
 */
export function createProviderCooloff(cooloffMs: number): ProviderCooloff {
  const window = Number.isFinite(cooloffMs) ? Math.max(0, cooloffMs) : 0;
  let until = 0;

  return {
    active(): boolean {
      if (window === 0) return false;
      return Date.now() < until;
    },

    recordFailure(): void {
      until = Date.now() + window;
    },

    recordSuccess(): void {
      until = 0;
    },
  };
}
