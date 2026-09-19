/**
 * Login throttling for `createAuthService()` — failed-attempt lockout and
 * per-identifier rate limiting.
 *
 * @module authProvider/authProvider.throttle
 */

import type {
  LoginAttemptRecord,
  LoginThrottleConfig,
} from "../authTypes/authAttempt.type.js";
import {
  AccountLockedError,
  AuthRateLimitError,
} from "../authErrors/authError.base.js";

const DEFAULT_MAX_FAILED_ATTEMPTS = 5;
const DEFAULT_LOCKOUT_SECONDS = 900;
const DEFAULT_MAX_ATTEMPTS_PER_WINDOW = 20;
const DEFAULT_WINDOW_SECONDS = 60;

/**
 * The key under which an identifier's login attempts are counted.
 *
 * Identifiers are emails or usernames, which consumers almost always
 * resolve case-insensitively. Counting the raw string gave
 * `alice@example.com`, `Alice@example.com` and ` alice@example.com` three
 * independent attempt budgets against one account — a lockout bypass that
 * cost the attacker nothing. Trimming, NFKC-folding and lower-casing keeps
 * unknown and known identifiers throttled identically while closing that.
 */
export function throttleKey(identifier: string): string {
  return String(identifier).normalize("NFKC").trim().toLowerCase();
}

/** A failure slot reserved by {@link LoginThrottleGate.begin}. */
export interface LoginThrottleSlot {
  /** The failure count including this attempt's reservation. */
  readonly failures: number;
}

/** Lockout and rate-limit gate wrapped around one `login()` call. */
export interface LoginThrottleGate {
  /**
   * Admit an attempt. Throws when the identifier is locked or over its
   * window budget; otherwise reserves a failure slot *before* the password
   * is checked and returns it.
   */
  begin(identifier: string): Promise<LoginThrottleSlot>;
  /** The attempt failed: lock the identifier if its slot reached the limit. */
  fail(identifier: string, slot: LoginThrottleSlot): Promise<void>;
  /** The credentials were correct: clear the identifier's counters. */
  succeed(identifier: string): Promise<void>;
}

const NO_SLOT: LoginThrottleSlot = Object.freeze({ failures: 0 });

/**
 * Build the throttle gate for a {@link LoginThrottleConfig}.
 *
 * The failure is counted up front and cleared on success. Counting it only
 * after the (slow) password check was check-then-act: a parallel burst all
 * passed the lock check before any failure landed, so an attacker got
 * `maxAttemptsPerWindow` guesses per lockout instead of `maxFailedAttempts`.
 * With the reservation, the (n+1)th concurrent attempt sees `failures > n`
 * and is refused without evaluating the password. This relies on the
 * store's `recordFailure` being atomic, as the in-memory store's is.
 *
 * An attempt that throws for another reason (e.g. the user lookup fails)
 * keeps its reservation, so it counts as a failure.
 */
export function createLoginThrottleGate(
  config: LoginThrottleConfig | undefined,
): LoginThrottleGate {
  const maxFailedAttempts =
    config?.maxFailedAttempts ?? DEFAULT_MAX_FAILED_ATTEMPTS;
  const lockoutMs = (config?.lockoutSeconds ?? DEFAULT_LOCKOUT_SECONDS) * 1000;
  const maxAttemptsPerWindow =
    config?.maxAttemptsPerWindow ?? DEFAULT_MAX_ATTEMPTS_PER_WINDOW;
  const windowSeconds = config?.windowSeconds ?? DEFAULT_WINDOW_SECONDS;

  function locked(record: LoginAttemptRecord, now: number): AccountLockedError {
    const until = record.lockedUntil ?? now + lockoutMs;
    return new AccountLockedError(undefined, {
      retryAfterSeconds: Math.max(1, Math.ceil((until - now) / 1000)),
    });
  }

  return {
    async begin(identifier: string): Promise<LoginThrottleSlot> {
      if (!config) return NO_SLOT;
      const key = throttleKey(identifier);
      const now = Date.now();
      const current = await config.store.get(key);
      if (current.lockedUntil !== undefined && current.lockedUntil > now) {
        throw locked(current, now);
      }
      const updated = await config.store.recordAttempt(key);
      if (updated.attempts > maxAttemptsPerWindow) {
        throw new AuthRateLimitError(undefined, {
          retryAfterSeconds: windowSeconds,
        });
      }
      const reserved = await config.store.recordFailure(key);
      if (reserved.failures > maxFailedAttempts) {
        const alreadyLocked =
          reserved.lockedUntil !== undefined && reserved.lockedUntil > now;
        if (!alreadyLocked) await config.store.lock(key, now + lockoutMs);
        throw locked(reserved, now);
      }
      return { failures: reserved.failures };
    },

    async fail(identifier: string, slot: LoginThrottleSlot): Promise<void> {
      if (!config) return;
      if (slot.failures >= maxFailedAttempts) {
        await config.store.lock(throttleKey(identifier), Date.now() + lockoutMs);
      }
    },

    async succeed(identifier: string): Promise<void> {
      await config?.store.reset(throttleKey(identifier));
    },
  };
}
