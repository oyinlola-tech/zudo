/**
 * Repository, serialization, locking, lifecycle, and context types.
 */

import type { StorageHealth } from "./storageDatabase.type.js";

/** Generic repository interface for CRUD operations. */
export interface Repository<Entity, ID> {
  findById(id: ID): Promise<Entity | null>;
  findByIds(ids: readonly ID[]): Promise<readonly Entity[]>;
  create(entity: Entity): Promise<Entity>;
  update(id: ID, changes: Partial<Entity>): Promise<Entity>;
  delete(id: ID): Promise<void>;
  exists(id: ID): Promise<boolean>;
}

/** Serialization format. */
export type SerializationFormat = "json" | "msgpack" | "binary";

/** Serializer for encoding/decoding storage data. */
export interface Serializer {
  serialize<T>(value: T, format?: SerializationFormat): Uint8Array;
  deserialize<T>(data: Uint8Array, format?: SerializationFormat): T;
}

/** Distributed lock. */
export interface Lock {
  readonly lockId: string;
  readonly resource: string;
  readonly acquiredAt: Date;
  readonly expiresAt: Date;
  /**
   * Monotonically increasing token for this acquisition.
   *
   * A lock can expire while its holder is still working. Pass this fence to
   * the protected resource and reject writes carrying a stale one, so a
   * superseded holder cannot complete a write behind the new holder's back.
   */
  readonly fence: number;
  /** Whether this handle still holds the lock and has not expired. */
  isHeld(): boolean;
  release(): Promise<void>;
  extend(durationMs: number): Promise<void>;
}

/** Options for acquiring a lock. */
export interface LockOptions {
  readonly timeout?: number;
  readonly ttl?: number;
  readonly retryInterval?: number;
}

/** Lock manager for distributed locking. */
export interface LockManager {
  acquire(resource: string, options?: LockOptions): Promise<Lock>;
  tryAcquire(resource: string, ttlMs: number): Promise<Lock | null>;
  isLocked(resource: string): Promise<boolean>;
}

/** Storage lifecycle phases. */
export type StorageLifecyclePhase =
  | "uninitialized"
  | "initializing"
  | "ready"
  | "draining"
  | "drained"
  | "shutdown";

/** Lifecycle hooks for storage components. */
export interface StorageLifecycle {
  initialize(): Promise<void>;
  start(): Promise<void>;
  healthCheck(): Promise<StorageHealth>;
  drain(): Promise<void>;
  shutdown(): Promise<void>;
  getPhase(): StorageLifecyclePhase;
}

/** Context for storage operations (carries tenant, trace, etc.). */
export interface StorageContext {
  readonly tenantId?: string;
  readonly traceId?: string;
  readonly requestId?: string;
  readonly userId?: string;
  readonly metadata?: Record<string, unknown>;
}
