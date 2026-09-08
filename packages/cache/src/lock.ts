/**
 * @zudojs/cache — Lock Manager
 *
 * In-process lock manager with a pluggable `CacheLockStore`, for preventing
 * concurrent cache operations. The bundled `InMemoryLockStore` holds leases
 * in a single `Map` in a single process — it is NOT distributed. Pass a
 * shared store (the exported `defaultLockStore` to share across services in
 * one process, or a Redis-backed `CacheLockStore` to share across processes)
 * via `CacheConfig.lockStore` when wider mutual exclusion is required.
 *
 * Leases are measured on a monotonic clock and are renewed by a heartbeat
 * while the critical section runs, so a slow `fn()` does not silently lose
 * its lock to expiry. If a lease is lost anyway, `withLock` aborts the
 * signal it passed to `fn` and throws rather than reporting success.
 */

import { randomUUID } from "node:crypto";
import type {
  CacheLock,
  CacheLockOptions,
  CacheLockStore,
  CacheTTL,
} from "./types.js";
import type { CacheErrorCode } from "./types-config.js";
import {
  DEFAULT_LOCK_RETRY_ATTEMPTS,
  DEFAULT_LOCK_RETRY_DELAY_MS,
  DEFAULT_LOCK_TTL_MS,
  LOCK_HEARTBEAT_DIVISOR,
} from "./constants.js";
import { CacheError, CacheOperation } from "./errors.js";
import { assertValidTtl, monotonicNow, wallClockFor } from "./utils.js";

function generateToken(): string {
  return randomUUID();
}

/** Separates the namespace from the lock name in the internal map key. */
const LOCK_SCOPE_SEPARATOR = "\u0000";

/**
 * Composes the scoped lock name. Two callers holding the same lock name
 * under different namespaces do not contend.
 */
function scopedLockKey(key: string, options?: CacheLockOptions): string {
  return options?.namespace !== undefined
    ? `${options.namespace}${LOCK_SCOPE_SEPARATOR}${key}`
    : key;
}

export class InMemoryLockStore implements CacheLockStore {
  private readonly locks = new Map<
    string,
    { token: string; expiresAt: number | null }
  >();

  async acquire(
    key: string,
    options?: CacheLockOptions,
  ): Promise<CacheLock | null> {
    const ttl = options?.ttl !== undefined ? options.ttl : DEFAULT_LOCK_TTL_MS;
    // A negative or zero TTL would mint an already-expired lease that the
    // next sweep drops, giving no exclusion at all while appearing to work.
    assertValidTtl(ttl);
    const token = generateToken();
    const now = monotonicNow();
    const expiresAt = ttl !== null ? now + ttl : null;
    const scoped = scopedLockKey(key, options);
    this.sweepExpired(now);
    if (this.locks.has(scoped)) return null;
    this.locks.set(scoped, { token, expiresAt });
    return {
      key,
      token,
      acquiredAt: wallClockFor(now),
      expiresAt: expiresAt !== null ? wallClockFor(expiresAt) : null,
      release: async (): Promise<boolean> => {
        const current = this.locks.get(scoped);
        if (current && current.token === token) {
          this.locks.delete(scoped);
          return true;
        }
        return false;
      },
      extend: async (newTtl: CacheTTL): Promise<boolean> => {
        assertValidTtl(newTtl);
        const current = this.locks.get(scoped);
        if (current && current.token === token) {
          this.locks.set(scoped, {
            ...current,
            expiresAt: newTtl !== null ? monotonicNow() + newTtl : null,
          });
          return true;
        }
        return false;
      },
    };
  }

  /** Removes all expired locks. Called opportunistically on each acquire. */
  sweepExpired(now = monotonicNow()): void {
    for (const [key, lock] of [...this.locks]) {
      if (lock.expiresAt !== null && now >= lock.expiresAt) {
        this.locks.delete(key);
      }
    }
  }

  get size(): number {
    return this.locks.size;
  }
  clear(): void {
    this.locks.clear();
  }
}

export class CacheLockManager {
  private readonly store: CacheLockStore;
  private readonly retryAttempts: number;
  private readonly retryDelayMs: number;

  constructor(options?: {
    readonly store?: CacheLockStore;
    readonly retryAttempts?: number;
    readonly retryDelayMs?: number;
  }) {
    this.store = options?.store ?? new InMemoryLockStore();
    this.retryAttempts = options?.retryAttempts ?? DEFAULT_LOCK_RETRY_ATTEMPTS;
    this.retryDelayMs = options?.retryDelayMs ?? DEFAULT_LOCK_RETRY_DELAY_MS;
  }

  /**
   * Acquires a lock, retrying on contention.
   *
   * Returns `null` for ordinary contention (someone else holds it) and
   * throws only when the *last* attempt failed with a store error — the two
   * outcomes decide differently (retry vs. fail the request), so they are
   * never conflated.
   */
  async acquire(
    key: string,
    options?: CacheLockOptions,
  ): Promise<CacheLock | null> {
    // Per-call retry options take precedence over manager defaults.
    // `attempts: 0` is honored (single attempt, no retries).
    const attempts = options?.retry?.attempts ?? this.retryAttempts;
    const delay = options?.retry?.delay ?? this.retryDelayMs;
    let lastError: unknown;
    for (let attempt = 0; attempt <= attempts; attempt++) {
      try {
        const lock = await this.store.acquire(key, options);
        // An attempt that completed clears any earlier transient error:
        // `lastError` must describe the final outcome, not a stale one.
        lastError = undefined;
        if (lock) return lock;
      } catch (error) {
        lastError = error;
      }
      if (attempt < attempts) await sleep(delay);
    }
    if (lastError) {
      const code: CacheErrorCode = "CACHE_LOCK_ACQUIRE_FAILED";
      throw new CacheError(
        `Failed to acquire lock "${key}" after ${attempts} retries.`,
        {
          code,
          cause: lastError,
          operation: CacheOperation.LOCK_ACQUIRE,
          key,
        },
      );
    }
    return null;
  }

  /**
   * Runs `fn` while holding the lock.
   *
   * The lease is renewed on an interval of roughly `ttl / 3` for as long as
   * `fn` runs, so a critical section longer than the TTL does not silently
   * lose mutual exclusion. If renewal or release reports that the lease is
   * no longer ours, the `AbortSignal` passed to `fn` fires and the call
   * throws — losing a lease is never reported as success.
   */
  async withLock<T>(
    key: string,
    fn: (signal: AbortSignal) => Promise<T>,
    options?: CacheLockOptions,
  ): Promise<T> {
    const lock = await this.acquire(key, options);
    if (!lock) {
      const code: CacheErrorCode = "CACHE_LOCK_UNAVAILABLE";
      throw new CacheError(
        `Could not acquire lock "${key}" for exclusive operation.`,
        {
          code,
          operation: CacheOperation.LOCK_ACQUIRE,
          key,
          statusCode: 409,
        },
      );
    }

    const ttl = options?.ttl !== undefined ? options.ttl : DEFAULT_LOCK_TTL_MS;
    const controller = new AbortController();
    let leaseLost = false;
    let heartbeat: ReturnType<typeof setInterval> | undefined;

    if (ttl !== null) {
      const interval = Math.max(1, Math.floor(ttl / LOCK_HEARTBEAT_DIVISOR));
      heartbeat = setInterval(() => {
        void (async () => {
          try {
            const extended = await lock.extend(ttl);
            if (extended) return;
          } catch {
            /* fall through — treat a failed renewal as a lost lease */
          }
          leaseLost = true;
          if (heartbeat !== undefined) clearInterval(heartbeat);
          controller.abort(
            new CacheError(`Lock "${key}" lease was lost during renewal.`, {
              code: "CACHE_LOCK_LOST",
              operation: CacheOperation.LOCK_ACQUIRE,
              key,
            }),
          );
        })();
      }, interval);
      // Never hold the event loop open on the cache's behalf.
      heartbeat.unref?.();
    }

    let value: T;
    let failure: unknown;
    let failed = false;
    try {
      value = await fn(controller.signal);
    } catch (error) {
      failed = true;
      failure = error;
    } finally {
      if (heartbeat !== undefined) clearInterval(heartbeat);
    }

    // `release()` returning false is the one signal that the lease expired or
    // was taken over mid-critical-section. Surfacing it is the whole point of
    // minting a fencing token. An error thrown by `fn` still wins, so the
    // real cause is never masked.
    const released = await lock.release();
    if (failed) throw failure;
    if (!released || leaseLost) {
      const code: CacheErrorCode = "CACHE_LOCK_LOST";
      throw new CacheError(
        `Lock "${key}" was lost before the critical section completed; its result cannot be trusted.`,
        {
          code,
          operation: CacheOperation.LOCK_RELEASE,
          key,
          statusCode: 409,
        },
      );
    }
    return value!;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createLockManager(options?: {
  readonly store?: CacheLockStore;
  readonly retryAttempts?: number;
  readonly retryDelayMs?: number;
}): CacheLockManager {
  return new CacheLockManager(options);
}

/**
 * Process-wide lock store. Pass it as `CacheConfig.lockStore` when several
 * `CacheService` instances in one process must share locks.
 */
export const defaultLockStore = new InMemoryLockStore();
