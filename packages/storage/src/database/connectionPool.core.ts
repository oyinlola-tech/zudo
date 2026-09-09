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
import {
  DRAIN_TIMEOUT_MS,
  checkPoolHealth,
  drainPool,
} from "./connectionPool.lifecycle.js";
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

/** Bookkeeping the pool keeps for each connection it owns. */
interface ConnectionAge {
  /** When the connection was produced by the factory. */
  readonly createdAt: number;
  /** When the connection was last returned to the idle list. */
  idleSince: number;
}

export class ConnectionPool {
  private readonly options: ConnectionPoolOptions;
  private readonly available: Connection[] = [];
  private readonly inUse = new Set<Connection>();
  private readonly waitQueue = new WaitQueue();
  /** Creation and idle timestamps, keyed by the connection they describe. */
  private readonly ages = new WeakMap<Connection, ConnectionAge>();
  private pending = 0;
  private initialized = false;
  private closed = false;

  constructor(
    private readonly factory: () => Promise<Connection>,
    options?: Partial<ConnectionPoolOptions>,
  ) {
    this.options = { ...DEFAULT_POOL_OPTIONS, ...options };
  }

  /**
   * Initialize the pool with minimum connections. Idempotent.
   *
   * A failure resets the flag, so a caller that retries after a transient
   * factory outage actually gets a second attempt instead of a pool that
   * reports itself initialized while holding fewer connections than `min`.
   */
  async initialize(): Promise<void> {
    if (this.initialized || this.closed) return;
    this.initialized = true;

    const initial = Math.min(this.options.min, this.options.max);
    try {
      for (let i = 0; i < initial; i++) {
        this.available.push(await this.create());
      }
    } catch (error) {
      this.initialized = false;
      throw error;
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

      // A connection that sat idle past `idleTimeout`, or that has outlived
      // `maxLifetime`, is retired rather than handed out: both bounds exist
      // because a long-lived connection is the one a server or a load
      // balancer silently drops.
      if (this.isRetired(conn)) {
        await this.close(conn);
        this.assertOpen();
        continue;
      }

      this.inUse.add(conn);
      if (await this.isAlive(conn)) return conn;

      this.inUse.delete(conn);
      await this.close(conn);
      this.assertOpen();
    }

    if (this.total() < this.options.max) {
      this.pending++;
      try {
        const conn = await this.create();
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

    // A connection past `maxLifetime` is retired on the way back rather than
    // parked for the next caller to discover.
    if (this.isOverLifetime(connection)) {
      await this.close(connection);
      return;
    }

    if (this.waitQueue.handOff(connection)) {
      this.inUse.add(connection);
      return;
    }

    const age = this.ages.get(connection);
    if (age) age.idleSince = Date.now();

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

  /**
   * Drain all connections gracefully.
   *
   * `drainPool` has always accepted a bound on how long it waits for
   * in-flight work, but the pool gave callers no way to supply one, so every
   * shutdown was pinned to the 30-second default.
   *
   * @param timeoutMs - How long to wait for in-flight connections before
   *   force-closing them. Defaults to {@link DRAIN_TIMEOUT_MS}.
   */
  async drain(timeoutMs: number = DRAIN_TIMEOUT_MS): Promise<void> {
    this.closed = true;
    await drainPool(this.state(), timeoutMs);
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
      factory: () => this.create(),
      isAlive: (conn) => this.isAlive(conn),
      close: (conn) => this.close(conn),
      stats: () => this.getStats(),
    };
  }

  /**
   * Produce a connection, bounded by `connectionTimeout`.
   *
   * A factory that never settles would otherwise hang `acquire()` forever
   * while holding a reserved slot — `acquireTimeout` only governs callers
   * already parked in the wait queue, never the one doing the connecting.
   */
  private async create(): Promise<Connection> {
    const limit = this.options.connectionTimeout;
    const conn =
      limit > 0
        ? await this.withConnectionTimeout(this.factory(), limit)
        : await this.factory();

    this.ages.set(conn, { createdAt: Date.now(), idleSince: Date.now() });
    return conn;
  }

  private async withConnectionTimeout(
    pending: Promise<Connection>,
    limit: number,
  ): Promise<Connection> {
    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
      return await Promise.race([
        pending,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            reject(
              new StorageError(
                `Connection timeout: the pool factory did not produce a connection within ${limit}ms`,
                {
                  code: "STORAGE_CONNECTION_TIMEOUT",
                  statusCode: 504,
                },
              ),
            );
          }, limit);
          timer.unref?.();
        }),
      ]);
    } catch (error) {
      // The timeout won, but the factory may still be working. Whatever it
      // eventually produces is a real connection nobody holds a reference
      // to, so it is closed on arrival rather than leaked.
      void pending.then(
        (conn) => this.close(conn),
        () => undefined,
      );
      throw error;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  /** Whether an idle connection should be discarded instead of reused. */
  private isRetired(conn: Connection): boolean {
    if (this.isOverLifetime(conn)) return true;

    const idleTimeout = this.options.idleTimeout;
    if (idleTimeout <= 0) return false;

    const age = this.ages.get(conn);
    if (!age) return false;

    return Date.now() - age.idleSince >= idleTimeout;
  }

  /** Whether a connection has outlived `maxLifetime` (0 disables the bound). */
  private isOverLifetime(conn: Connection): boolean {
    const maxLifetime = this.options.maxLifetime;
    if (maxLifetime <= 0) return false;

    const age = this.ages.get(conn);
    if (!age) return false;

    return Date.now() - age.createdAt >= maxLifetime;
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
