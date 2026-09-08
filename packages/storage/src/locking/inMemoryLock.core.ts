/**
 * @zudojs/storage — In-Memory Lock Manager
 *
 * Provides distributed-style locking for single-process scenarios.
 * For multi-process/multi-node, replace with Redis/Database-backed lock.
 */

import { randomBytes } from "node:crypto";
import { StorageError } from "@zudojs/errors";
import type { Lock, LockManager, LockOptions } from "../types/storage.type.js";
import { LockWaitQueues } from "./inMemoryLock.waiters.js";

/** Default lock options. */
const DEFAULT_LOCK_OPTIONS: Required<LockOptions> = {
  timeout: 10_000,
  ttl: 30_000,
  retryInterval: 100,
};

interface LockEntry {
  readonly lockId: string;
  readonly resource: string;
  readonly acquiredAt: Date;
  expiresAt: Date;
  /** Monotonic token; a holder whose fence is stale has lost the lock. */
  readonly fence: number;
}

/** Merges caller options over the defaults, ignoring explicit undefined. */
function withDefaults(options?: LockOptions): Required<LockOptions> {
  return {
    timeout: options?.timeout ?? DEFAULT_LOCK_OPTIONS.timeout,
    ttl: options?.ttl ?? DEFAULT_LOCK_OPTIONS.ttl,
    retryInterval: options?.retryInterval ?? DEFAULT_LOCK_OPTIONS.retryInterval,
  };
}

/**
 * In-memory lock manager implementation.
 */
export class InMemoryLockManager implements LockManager {
  private readonly locks = new Map<string, LockEntry>();
  private readonly waiters = new LockWaitQueues();
  private fenceCounter = 0;

  /**
   * Acquire a lock, waiting until one is available or the timeout elapses.
   *
   * Waiters are parked in FIFO order and woken by `release()`, so a released
   * lock is handed over immediately rather than after a polling interval.
   */
  async acquire(resource: string, options?: LockOptions): Promise<Lock> {
    const opts = withDefaults(options);
    const deadline = Date.now() + opts.timeout;

    for (;;) {
      const lock = this.tryAcquireLock(resource, opts.ttl);
      if (lock) return lock;

      const remaining = deadline - Date.now();
      if (remaining <= 0) break;

      await this.waiters.wait(
        resource,
        Math.min(remaining, opts.retryInterval),
      );
    }

    throw new StorageError(
      `Failed to acquire lock on "${resource}" within ${opts.timeout}ms`,
      { code: "STORAGE_LOCK_ACQUIRE_TIMEOUT", statusCode: 504 },
    );
  }

  async tryAcquire(resource: string, ttlMs: number): Promise<Lock | null> {
    return this.tryAcquireLock(resource, ttlMs);
  }

  async isLocked(resource: string): Promise<boolean> {
    const entry = this.locks.get(resource);
    if (!entry) return false;

    if (Date.now() > entry.expiresAt.getTime()) {
      this.locks.delete(resource);
      this.waiters.notify(resource);
      return false;
    }

    return true;
  }

  /**
   * Clean up expired locks.
   */
  cleanup(): void {
    const now = Date.now();
    for (const [resource, entry] of this.locks) {
      if (now > entry.expiresAt.getTime()) {
        this.locks.delete(resource);
        this.waiters.notify(resource);
      }
    }
  }

  /**
   * Release all locks and clean up.
   */
  clear(): void {
    this.locks.clear();
    this.waiters.clear();
  }

  private tryAcquireLock(resource: string, ttlMs: number): Lock | null {
    this.cleanup();

    if (this.locks.has(resource)) return null;

    const ttl =
      Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : DEFAULT_LOCK_OPTIONS.ttl;
    const lockId = randomBytes(16).toString("hex");
    const entry: LockEntry = {
      lockId,
      resource,
      acquiredAt: new Date(),
      expiresAt: new Date(Date.now() + ttl),
      fence: ++this.fenceCounter,
    };
    this.locks.set(resource, entry);

    return this.createHandle(entry);
  }

  private createHandle(entry: LockEntry): Lock {
    const isHeld = (): boolean =>
      this.locks.get(entry.resource)?.lockId === entry.lockId &&
      Date.now() <= entry.expiresAt.getTime();

    return {
      lockId: entry.lockId,
      resource: entry.resource,
      acquiredAt: entry.acquiredAt,
      fence: entry.fence,
      get expiresAt(): Date {
        return entry.expiresAt;
      },
      isHeld,
      release: async (): Promise<void> => {
        if (this.locks.get(entry.resource)?.lockId !== entry.lockId) return;
        this.locks.delete(entry.resource);
        this.waiters.notify(entry.resource);
      },
      extend: async (durationMs: number): Promise<void> => {
        if (!isHeld()) {
          throw new StorageError(
            `Lock on "${entry.resource}" is no longer held and cannot be extended`,
            { code: "STORAGE_LOCK_LOST", statusCode: 409 },
          );
        }
        entry.expiresAt = new Date(Date.now() + durationMs);
      },
    };
  }
}
