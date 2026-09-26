/**
 * @zudojs/security — Sliding-window bookkeeping for the rate limiter.
 *
 * A key's allowed hits are kept in chronological order behind a head
 * offset. Expiring old hits is a binary search that advances the head, and
 * the array is compacted only once the dead prefix outgrows the live
 * suffix, so every operation is O(log n) amortised. The previous
 * `timestamps.filter(...)` copied the whole array on every check, which
 * made the cost of one request proportional to `max`: a limiter with
 * `max: 1e6` spent more than twenty percent of a core on a single busy
 * client where `max: 300` spent three.
 */

/** Allowed hits inside a key's window, oldest first from `head`. */
export interface SlidingWindow {
  /** Monotonic hit timestamps; entries before `head` have expired. */
  timestamps: number[];
  /** Index of the oldest live hit. */
  head: number;
}

/** Create an empty window. */
export function createSlidingWindow(): SlidingWindow {
  return { timestamps: [], head: 0 };
}

/**
 * Drop every hit at or before `windowStart`.
 *
 * Timestamps are appended in arrival order, so the live region is a suffix
 * and its start can be found by binary search. Compaction copies the live
 * suffix only when the dead prefix is at least as long, which bounds both
 * the copy cost (amortised O(1) per hit) and the retained memory (at most
 * twice the live hits).
 */
export function pruneWindow(window: SlidingWindow, windowStart: number): void {
  const { timestamps } = window;
  let low = window.head;
  let high = timestamps.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if ((timestamps[middle] as number) > windowStart) {
      high = middle;
    } else {
      low = middle + 1;
    }
  }
  window.head = low;
  if (low === timestamps.length) {
    window.timestamps = [];
    window.head = 0;
  } else if (low > 0 && low * 2 >= timestamps.length) {
    window.timestamps = timestamps.slice(low);
    window.head = 0;
  }
}

/** Number of live hits. */
export function windowCount(window: SlidingWindow): number {
  return window.timestamps.length - window.head;
}

/** Timestamp of the oldest live hit, if any. */
export function windowOldest(window: SlidingWindow): number | undefined {
  return window.timestamps[window.head];
}

/** Record an allowed hit at `now`. */
export function recordHit(window: SlidingWindow, now: number): void {
  window.timestamps.push(now);
}
