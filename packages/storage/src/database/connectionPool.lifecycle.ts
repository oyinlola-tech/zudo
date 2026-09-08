/**
 * @zudojs/storage — Connection pool drain and health probing.
 *
 * Split from the pool itself so the acquire/release hot path stays readable;
 * both operate on the same internal state handed over by the pool.
 */

import { StorageError } from "@zudojs/errors";
import type { Connection, PoolStats } from "../types/storage.type.js";
import type { WaitQueue } from "./connectionPool.waiters.js";

/** How long `drainPool` waits for in-flight work before force-closing. */
export const DRAIN_TIMEOUT_MS = 30_000;

/** The pool internals these routines operate on. */
export interface PoolState {
  readonly available: Connection[];
  readonly inUse: Set<Connection>;
  readonly waitQueue: WaitQueue;
  readonly factory: () => Promise<Connection>;
  isAlive(conn: Connection): Promise<boolean>;
  close(conn: Connection): Promise<void>;
  stats(): PoolStats;
}

/**
 * Reject waiters, close idle connections, then wait out in-flight work.
 *
 * @param state - The pool internals.
 * @param timeoutMs - How long to wait for in-flight connections.
 */
export async function drainPool(
  state: PoolState,
  timeoutMs: number = DRAIN_TIMEOUT_MS,
): Promise<void> {
  state.waitQueue.rejectAll(
    new StorageError("Pool is draining", {
      code: "STORAGE_CONNECTION_POOL_DRAINING",
      statusCode: 503,
    }),
  );

  while (state.available.length > 0) {
    await state.close(state.available.pop()!);
  }

  const start = Date.now();
  while (state.inUse.size > 0 && Date.now() - start < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  for (const conn of state.inUse) await state.close(conn);
  state.inUse.clear();
}

/**
 * Probe pool health without changing pool membership.
 *
 * An empty pool is probed with a throwaway connection that is closed again, so
 * a health check never silently grows the pool.
 *
 * @param state - The pool internals.
 * @returns Whether the pool can serve traffic, with a stats snapshot.
 */
export async function checkPoolHealth(
  state: PoolState,
): Promise<{ healthy: boolean; stats: PoolStats }> {
  const stats = state.stats();

  for (const conn of [...state.available]) {
    if (await state.isAlive(conn)) return { healthy: true, stats };
  }

  if (state.inUse.size > 0) return { healthy: true, stats };
  if (state.available.length > 0) return { healthy: false, stats };

  try {
    const probe = await state.factory();
    const alive = await state.isAlive(probe);
    await state.close(probe);
    return { healthy: alive, stats };
  } catch {
    return { healthy: false, stats };
  }
}
