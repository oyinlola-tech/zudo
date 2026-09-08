/**
 * @zudojs/storage — Lock wait queue.
 *
 * Callers waiting on a held lock park here in FIFO order and are woken by
 * `release()`, rather than each polling on its own timer.
 *
 * @module locking/inMemoryLock.waiters
 */

/** A caller parked on a resource. */
export interface Waiter {
  readonly resolve: () => void;
  readonly timer: ReturnType<typeof setTimeout>;
  settled: boolean;
}

/** FIFO wait queues, keyed by resource. */
export class LockWaitQueues {
  private readonly queues = new Map<string, Waiter[]>();

  /**
   * Park the caller until the resource is released or the timeout elapses.
   *
   * @param resource - The contended resource.
   * @param timeoutMs - How long to wait before retrying.
   */
  wait(resource: string, timeoutMs: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const waiter: Waiter = {
        settled: false,
        resolve,
        timer: setTimeout(() => {
          this.remove(resource, waiter);
          if (waiter.settled) return;
          waiter.settled = true;
          resolve();
        }, timeoutMs),
      };

      const queue = this.queues.get(resource);
      if (queue) queue.push(waiter);
      else this.queues.set(resource, [waiter]);
    });
  }

  /**
   * Wake the longest-waiting caller for a resource.
   *
   * @param resource - The resource that became available.
   */
  notify(resource: string): void {
    const queue = this.queues.get(resource);
    if (!queue) return;

    while (queue.length > 0) {
      const waiter = queue.shift()!;
      clearTimeout(waiter.timer);
      if (waiter.settled) continue;
      waiter.settled = true;
      waiter.resolve();
      break;
    }

    if (queue.length === 0) this.queues.delete(resource);
  }

  /** Wake and discard every waiter. */
  clear(): void {
    for (const queue of this.queues.values()) {
      for (const waiter of queue) {
        clearTimeout(waiter.timer);
        if (waiter.settled) continue;
        waiter.settled = true;
        waiter.resolve();
      }
    }
    this.queues.clear();
  }

  private remove(resource: string, waiter: Waiter): void {
    const queue = this.queues.get(resource);
    if (!queue) return;
    const index = queue.indexOf(waiter);
    if (index !== -1) queue.splice(index, 1);
    if (queue.length === 0) this.queues.delete(resource);
  }
}
