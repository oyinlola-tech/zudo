/**
 * Login attempt tracking types — brute-force lockout and rate limiting.
 *
 * @module authTypes/authAttempt
 */

/**
 * Current attempt state for one login identifier.
 */
export interface LoginAttemptRecord {
  /** Consecutive failed authentications since the last successful login. */
  readonly failures: number;
  /** Attempts counted inside the current rate-limit window. */
  readonly attempts: number;
  /** Unix milliseconds until which the identifier is locked, if locked. */
  readonly lockedUntil?: number;
}

/**
 * Store backing failed-attempt lockout and login rate limiting.
 *
 * Keys are the *submitted* identifier — trimmed, NFKC-normalised and
 * lower-cased by `createAuthService()` so that case and whitespace variants
 * of one email share a budget — not a resolved user id, so unknown and
 * known accounts are throttled identically and the endpoint stays free of
 * an existence oracle. The in-memory implementation
 * (`createMemoryLoginAttemptStore`) is per-process; back this with Redis to
 * make limits hold across instances.
 */
export interface LoginAttemptStore {
  /** Read the current state without recording anything. */
  get(identifier: string): Promise<LoginAttemptRecord>;
  /** Count an attempt (before credentials are checked). */
  recordAttempt(identifier: string): Promise<LoginAttemptRecord>;
  /** Count a failed authentication. */
  recordFailure(identifier: string): Promise<LoginAttemptRecord>;
  /** Lock an identifier until `until` (Unix milliseconds). */
  lock(identifier: string, until: number): Promise<void>;
  /** Clear all state for an identifier (successful login). */
  reset(identifier: string): Promise<void>;
}

/**
 * Brute-force protection settings for `createAuthService()`.
 */
export interface LoginThrottleConfig {
  /** Where attempt counters live. */
  readonly store: LoginAttemptStore;
  /**
   * Consecutive failures that trigger a lockout (default: 5).
   * `login()` then throws `AccountLockedError` until the lockout lapses.
   */
  readonly maxFailedAttempts?: number;
  /** Lockout duration in seconds (default: 900). */
  readonly lockoutSeconds?: number;
  /**
   * Attempts allowed per identifier inside the store's rate-limit window
   * (default: 20). Exceeding it throws `AuthRateLimitError`. This bounds the
   * scrypt work an attacker can force the server to perform.
   */
  readonly maxAttemptsPerWindow?: number;
  /**
   * Window length in seconds reported on `AuthRateLimitError.retryAfterSeconds`
   * (default: 60). The store owns the actual window.
   */
  readonly windowSeconds?: number;
}
