import type { CacheNamespace } from "./types-keys.js";
import type { CacheTTL } from "./types-values.js";

export interface CacheLockOptions {
  readonly ttl?: CacheTTL;
  /**
   * Scopes the lock. Two callers using the same key under different
   * namespaces do not contend with each other.
   */
  readonly namespace?: CacheNamespace;
  readonly retry?: {
    readonly attempts: number;
    readonly delay: number;
  };
}

export interface CacheLock {
  readonly key: string;
  readonly token: string;
  readonly acquiredAt: Date;
  readonly expiresAt: Date | null;
  release(): Promise<boolean>;
  extend(ttl: CacheTTL): Promise<boolean>;
}

export interface CacheLockStore {
  acquire(key: string, options?: CacheLockOptions): Promise<CacheLock | null>;
  /** Drops expired leases. Called opportunistically by in-process stores. */
  sweepExpired?(now?: number): void;
  /** Releases every held lease. Intended for tests and shutdown. */
  clear?(): void;
}
