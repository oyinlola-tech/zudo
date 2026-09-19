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
import { evictOne, isStale, isUnlocked } from "./authAttempt.eviction.js";

const DEFAULT_WINDOW_SECONDS = 60;
const DEFAULT_PURGE_INTERVAL_MS = 60_000;
const DEFAULT_FAILURE_TTL_SECONDS = 900;
const DEFAULT_MAX_ENTRIES = 100_000;

interface AttemptEntry {
  failures: number;
  attempts: number;
  windowStart: number;
  lastFailureAt: number;
  lockedUntil?: number;
}

const EMPTY: LoginAttemptRecord = { failures: 0, attempts: 0 };

/**
 * Create an in-memory {@link LoginAttemptStore}.
 *
 * @param options.windowSeconds - Rate-limit window length (default: 60).
 * @param options.purgeIntervalMs - Minimum gap between sweeps of stale
 *   entries (default: 60000).
 * @param options.failureTtlSeconds - Idle time after which an unlocked
 *   failure streak is forgotten and its entry evicted (default: 900).
 *   Without it, every identifier with one failure was kept forever, so
 *   spraying random identifiers grew the map without bound.
 * @param options.maxEntries - Hard cap on tracked identifiers (default:
 *   100000). At the cap the oldest unlocked entry is evicted; locked
 *   entries are only evicted when every entry is locked.
 */
export function createMemoryLoginAttemptStore(options?: {
  readonly windowSeconds?: number;
  readonly purgeIntervalMs?: number;
  readonly failureTtlSeconds?: number;
  readonly maxEntries?: number;
}): LoginAttemptStore {
  const windowMs = (options?.windowSeconds ?? DEFAULT_WINDOW_SECONDS) * 1000;
  const purgeIntervalMs = options?.purgeIntervalMs ?? DEFAULT_PURGE_INTERVAL_MS;
  const failureTtlMs =
    (options?.failureTtlSeconds ?? DEFAULT_FAILURE_TTL_SECONDS) * 1000;
  const maxEntries = options?.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const entries = new Map<string, AttemptEntry>();
  let lastPurge = 0;

  function maybePurge(now: number): void {
    if (now - lastPurge < purgeIntervalMs) return;
    lastPurge = now;
    for (const [key, entry] of entries) {
      if (isStale(entry, now, windowMs, failureTtlMs)) entries.delete(key);
    }
  }

  function load(identifier: string, now: number): AttemptEntry {
    maybePurge(now);
    let entry = entries.get(identifier);
    if (!entry) {
      if (entries.size >= maxEntries) evictOne(entries, now);
      entry = { failures: 0, attempts: 0, windowStart: now, lastFailureAt: 0 };
      entries.set(identifier, entry);
    }
    if (
      entry.failures > 0 &&
      isUnlocked(entry, now) &&
      now - entry.lastFailureAt >= failureTtlMs
    ) {
      entry.failures = 0;
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
      entry.lastFailureAt = Date.now();
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
