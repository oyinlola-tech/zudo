/**
 * In-memory login attempt store.
 *
 * @module authProvider/authAttempt.memory
 *
 * Single-process only: counters are not shared between instances. Back
 * `LoginAttemptStore` with Redis for a real deployment.
 */

import type {
  LoginAttemptRecord,
  LoginAttemptStore,
} from "../authTypes/authAttempt.type.js";

const DEFAULT_WINDOW_SECONDS = 60;
const DEFAULT_PURGE_INTERVAL_MS = 60_000;

interface AttemptEntry {
  failures: number;
  attempts: number;
  windowStart: number;
  lockedUntil?: number;
}

const EMPTY: LoginAttemptRecord = { failures: 0, attempts: 0 };

/**
 * Create an in-memory {@link LoginAttemptStore}.
 *
 * @param options.windowSeconds - Rate-limit window length (default: 60).
 * @param options.purgeIntervalMs - Minimum gap between sweeps of stale
 *   entries (default: 60000).
 */
export function createMemoryLoginAttemptStore(options?: {
  readonly windowSeconds?: number;
  readonly purgeIntervalMs?: number;
}): LoginAttemptStore {
  const windowMs = (options?.windowSeconds ?? DEFAULT_WINDOW_SECONDS) * 1000;
  const purgeIntervalMs = options?.purgeIntervalMs ?? DEFAULT_PURGE_INTERVAL_MS;
  const entries = new Map<string, AttemptEntry>();
  let lastPurge = 0;

  function maybePurge(now: number): void {
    if (now - lastPurge < purgeIntervalMs) return;
    lastPurge = now;
    for (const [key, entry] of entries) {
      const locked = entry.lockedUntil !== undefined && entry.lockedUntil > now;
      const fresh = now - entry.windowStart < windowMs;
      if (!locked && !fresh && entry.failures === 0) {
        entries.delete(key);
      }
    }
  }

  function load(identifier: string, now: number): AttemptEntry {
    maybePurge(now);
    let entry = entries.get(identifier);
    if (!entry) {
      entry = { failures: 0, attempts: 0, windowStart: now };
      entries.set(identifier, entry);
    }
    if (now - entry.windowStart >= windowMs) {
      entry.windowStart = now;
      entry.attempts = 0;
    }
    if (entry.lockedUntil !== undefined && entry.lockedUntil <= now) {
      // Lockout lapsed: clear it and the failure streak that caused it.
      delete entry.lockedUntil;
      entry.failures = 0;
    }
    return entry;
  }

  function snapshot(entry: AttemptEntry): LoginAttemptRecord {
    return entry.lockedUntil !== undefined
      ? {
          failures: entry.failures,
          attempts: entry.attempts,
          lockedUntil: entry.lockedUntil,
        }
      : { failures: entry.failures, attempts: entry.attempts };
  }

  return {
    async get(identifier: string): Promise<LoginAttemptRecord> {
      const now = Date.now();
      if (!entries.has(identifier)) {
        maybePurge(now);
        return EMPTY;
      }
      return snapshot(load(identifier, now));
    },

    async recordAttempt(identifier: string): Promise<LoginAttemptRecord> {
      const entry = load(identifier, Date.now());
      entry.attempts++;
      return snapshot(entry);
    },

    async recordFailure(identifier: string): Promise<LoginAttemptRecord> {
      const entry = load(identifier, Date.now());
      entry.failures++;
      return snapshot(entry);
    },

    async lock(identifier: string, until: number): Promise<void> {
      const entry = load(identifier, Date.now());
      entry.lockedUntil = until;
    },

    async reset(identifier: string): Promise<void> {
      entries.delete(identifier);
    },
  };
}
