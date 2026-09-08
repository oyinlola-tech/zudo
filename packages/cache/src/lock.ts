/**
 * @zudojs/cache — Lock Manager
 * Distributed lock manager for preventing concurrent cache operations.
 */

import { randomUUID } from "node:crypto";
import type {
  CacheLock,
  CacheLockOptions,
  CacheLockStore,
  CacheTTL,
} from "./types.js";
import {
  DEFAULT_LOCK_RETRY_ATTEMPTS,
  DEFAULT_LOCK_RETRY_DELAY_MS,
  DEFAULT_LOCK_TTL_MS,
} from "./constants.js";
import { CacheError, CacheOperation } from "./errors.js";

function generateToken(): string {
  return randomUUID();
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
    const token = generateToken();
    const now = Date.now();
    const expiresAt = ttl !== null ? now + ttl : null;
    this.sweepExpired(now);
    if (this.locks.has(key)) return null;
    this.locks.set(key, { token, expiresAt });
    return {
      key,
      token,
      acquiredAt: new Date(now),
      expiresAt: expiresAt !== null ? new Date(expiresAt) : null,
      release: async (): Promise<boolean> => {
        const current = this.locks.get(key);
        if (current && current.token === token) {
          this.locks.delete(key);
          return true;
        }
        return false;
      },
      extend: async (newTtl: CacheTTL): Promise<boolean> => {
        const current = this.locks.get(key);
        if (current && current.token === token) {
          this.locks.set(key, {
            ...current,
            expiresAt: newTtl !== null ? Date.now() + newTtl : null,
          });
          return true;
        }
        return false;
      },
    };
  }

  /** Removes all expired locks. Called opportunistically on each acquire. */
  sweepExpired(now = Date.now()): void {
    for (const [key, lock] of [...this.locks]) {
      if (lock.expiresAt !== null && now > lock.expiresAt) {
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
        if (lock) return lock;
      } catch (error) {
        lastError = error;
      }
      if (attempt < attempts) await sleep(delay);
    }
    if (lastError)
      throw new CacheError(
        `Failed to acquire lock "${key}" after ${attempts} retries.`,
        { cause: lastError, operation: CacheOperation.LOCK_ACQUIRE, key },
      );
    return null;
  }

  async withLock<T>(
    key: string,
    fn: () => Promise<T>,
    options?: CacheLockOptions,
  ): Promise<T> {
    const lock = await this.acquire(key, options);
    if (!lock)
      throw new CacheError(
        `Could not acquire lock "${key}" for exclusive operation.`,
        { operation: CacheOperation.LOCK_ACQUIRE, key, statusCode: 409 },
      );
    try {
      return await fn();
    } finally {
      await lock.release();
    }
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

export const defaultLockStore = new InMemoryLockStore();
