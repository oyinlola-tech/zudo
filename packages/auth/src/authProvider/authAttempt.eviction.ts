/**
 * Eviction rules for the in-memory login attempt store.
 *
 * @module authProvider/authAttempt.eviction
 */

/** The fields of an attempt entry that eviction looks at. */
export interface EvictableAttemptEntry {
  readonly failures: number;
  readonly windowStart: number;
  readonly lastFailureAt: number;
  readonly lockedUntil?: number;
}

/** True when the entry carries no live lockout. */
export function isUnlocked(entry: EvictableAttemptEntry, now: number): boolean {
  return entry.lockedUntil === undefined || entry.lockedUntil <= now;
}

/**
 * True when the entry can be dropped without changing any decision: it is
 * unlocked, its rate-limit window has passed, and its failure streak (if
 * any) has been idle for at least `failureTtlMs`.
 */
export function isStale(
  entry: EvictableAttemptEntry,
  now: number,
  windowMs: number,
  failureTtlMs: number,
): boolean {
  if (!isUnlocked(entry, now)) return false;
  if (now - entry.windowStart < windowMs) return false;
  return entry.failures === 0 || now - entry.lastFailureAt >= failureTtlMs;
}

/**
 * Make room for one new entry: drop the oldest unlocked entry (Map order is
 * insertion order), or the oldest entry of all when every entry is locked.
 */
export function evictOne<E extends EvictableAttemptEntry>(
  entries: Map<string, E>,
  now: number,
): void {
  for (const [key, entry] of entries) {
    if (isUnlocked(entry, now)) {
      entries.delete(key);
      return;
    }
  }
  const oldest = entries.keys().next();
  if (!oldest.done) entries.delete(oldest.value);
}
