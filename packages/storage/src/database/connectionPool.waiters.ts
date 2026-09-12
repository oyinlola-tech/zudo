/**
 * @zudojs/storage — Connection pool wait queue.
 *
 * Callers that arrive while the pool is saturated park here in FIFO order and
 * are handed a connection directly by `release()`, rather than polling.
 */

import { StorageError } from "@zudojs/errors";
import type { Connection } from "../types/storage.type.js";

/** A parked acquire request. */
interface Waiter {
  readonly resolve: (conn: Connection) => void;
  readonly reject: (err: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
  settled: boolean;
}

/** FIFO queue of callers waiting for a connection. */
export class WaitQueue {
  private readonly waiters: Waiter[] = [];

  /** Number of callers currently waiting. */
  get size(): number {
    return this.waiters.length;
  }

  /**
   * Park the caller until a connection is released or the timeout elapses.
   *
   * @param timeoutMs - How long to wait before rejecting.
   * @returns A promise for the connection handed over by `release()`.
   */
  wait(timeoutMs: number): Promise<Connection> {
    return new Promise<Connection>((resolve, reject) => {
      const waiter: Waiter = {
        resolve,
        reject,
        settled: false,
        timer: setTimeout(() => {
          this.remove(waiter);
          if (waiter.settled) return;
          waiter.settled = true;
          reject(
            new StorageError(
              `Acquire timeout: no connection available within ${timeoutMs}ms`,
              { code: "STORAGE_CONNECTION_ACQUIRE_TIMEOUT", statusCode: 504 },
            ),
          );
        }, timeoutMs),
      };

      this.waiters.push(waiter);
    });
  }

  /**
   * Hand a connection to the longest-waiting caller.
   *
   * @param connection - The connection to hand over.
   * @returns True when a waiter took the connection.
   */
  handOff(connection: Connection): boolean {
    for (;;) {
      const waiter = this.waiters.shift();
      if (!waiter) return false;

      clearTimeout(waiter.timer);
      if (waiter.settled) continue;

      waiter.settled = true;
      waiter.resolve(connection);
      return true;
    }
  }

  /**
   * Reject the longest-waiting caller.
   *
   * Used when the pool tried to produce a replacement connection on a
   * waiter's behalf and the factory failed: the waiter learns what
   * `acquire()` would have thrown, instead of sitting out its timeout.
   *
   * @param error - The rejection reason.
   * @returns True when a waiter was rejected.
   */
  rejectOne(error: Error): boolean {
    for (;;) {
      const waiter = this.waiters.shift();
      if (!waiter) return false;

      clearTimeout(waiter.timer);
      if (waiter.settled) continue;

      waiter.settled = true;
      waiter.reject(error);
      return true;
    }
  }

  /**
   * Reject and clear every waiter.
   *
   * @param error - The rejection reason.
   */
  rejectAll(error: Error): void {
    for (const waiter of this.waiters.splice(0)) {
      clearTimeout(waiter.timer);
      if (waiter.settled) continue;
      waiter.settled = true;
      waiter.reject(error);
    }
  }

  private remove(waiter: Waiter): void {
    const index = this.waiters.indexOf(waiter);
    if (index !== -1) this.waiters.splice(index, 1);
  }
}
