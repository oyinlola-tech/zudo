/**
 * Connection pool that manages database connections with backpressure.
 */

import { StorageError } from "@zudojs/errors";
import type {
  Connection,
  ConnectionPoolOptions,
  PoolStats,
} from "../types/storage.type.js";
import type { PoolState } from "./connectionPool.lifecycle.js";
import { checkPoolHealth, drainPool } from "./connectionPool.lifecycle.js";
import { WaitQueue } from "./connectionPool.waiters.js";

/** Default pool options. */
const DEFAULT_POOL_OPTIONS: ConnectionPoolOptions = {
  min: 2,
  max: 10,
  acquireTimeout: 30_000,
  idleTimeout: 30_000,
  connectionTimeout: 10_000,
  maxLifetime: 0,
};

export class ConnectionPool {
  private readonly options: ConnectionPoolOptions;
  private readonly available: Connection[] = [];
  private readonly inUse = new Set<Connection>();
  private readonly waitQueue = new WaitQueue();
  private pending = 0;
  private initialized = false;
  private closed = false;

  constructor(
    private readonly factory: () => Promise<Connection>,
    options?: Partial<ConnectionPoolOptions>,
  ) {
    this.options = { ...DEFAULT_POOL_OPTIONS, ...options };
  }

  /** Initialize the pool with minimum connections. Idempotent. */
  async initialize(): Promise<void> {
    if (this.initialized || this.closed) return;
    this.initialized = true;

    const initial = Math.min(this.options.min, this.options.max);
    for (let i = 0; i < initial; i++) {
      this.available.push(await this.factory());
    }
  }

  /**
   * Acquire a connection from the pool.
   *
   * The slot is reserved before the factory is awaited, so concurrent callers
   * cannot each observe the same under-limit count and overshoot `max`.
   */
  async acquire(): Promise<Connection> {
    this.assertOpen();

    while (this.available.length > 0) {
      const conn = this.available.pop()!;
      this.inUse.add(conn);
      if (await this.isAlive(conn)) return conn;

      this.inUse.delete(conn);
      await this.close(conn);
      this.assertOpen();
    }

    if (this.total() < this.options.max) {
      this.pending++;
      try {
        const conn = await this.factory();
        this.inUse.add(conn);
        return conn;
      } finally {
        this.pending--;
      }
    }

    return this.waitQueue.wait(this.options.acquireTimeout);
  }

  /**
   * Release a connection back to the pool.
   *
   * A connection this pool did not issue, or one released twice, is ignored:
   * re-admitting it would hand the same connection to two callers.
   */
  async release(connection: Connection): Promise<void> {
    if (!this.inUse.delete(connection)) return;

    if (this.closed) {
      await this.close(connection);
      return;
    }

    if (this.waitQueue.handOff(connection)) {
      this.inUse.add(connection);
      return;
    }

    this.available.push(connection);
  }

  /** Use a connection and automatically release it. */
  async use<T>(fn: (conn: Connection) => Promise<T>): Promise<T> {
    const conn = await this.acquire();
    try {
      return await fn(conn);
    } finally {
      await this.release(conn);
    }
  }

  /** Get pool statistics. */
  getStats(): PoolStats {
    return {
      total: this.total(),
      idle: this.available.length,
      active: this.inUse.size,
      waiting: this.waitQueue.size,
    };
  }

  /** Drain all connections gracefully. */
  async drain(): Promise<void> {
    this.closed = true;
    await drainPool(this.state());
  }

  /** Check if the pool is healthy. */
  async healthCheck(): Promise<{ healthy: boolean; stats: PoolStats }> {
    return checkPoolHealth(this.state());
  }

  private state(): PoolState {
    return {
      available: this.available,
      inUse: this.inUse,
      waitQueue: this.waitQueue,
      factory: this.factory,
      isAlive: (conn) => this.isAlive(conn),
      close: (conn) => this.close(conn),
      stats: () => this.getStats(),
    };
  }

  private total(): number {
    return this.available.length + this.inUse.size + this.pending;
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new StorageError("Pool is closed", {
        code: "STORAGE_CONNECTION_POOL_CLOSED",
        statusCode: 503,
      });
    }
  }

  private async isAlive(conn: Connection): Promise<boolean> {
    try {
      return await conn.ping();
    } catch {
      return false;
    }
  }

  private async close(conn: Connection): Promise<void> {
    try {
      await conn.close();
    } catch {
      /* Ignore close errors */
    }
  }
}
