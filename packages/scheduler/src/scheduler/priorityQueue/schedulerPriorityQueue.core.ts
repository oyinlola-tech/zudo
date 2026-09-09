import type { Schedule } from "../schedule/schedule.type.js";

/**
 * Priority queue using a min heap for scheduling.
 *
 * Ordered by fire time, with `ScheduleOptions.priority` breaking ties: a
 * higher priority runs first among schedules due at the same instant. That
 * option used to be documented as "reserved" and read by nothing at all.
 *
 * Provides O(log n) insertion and removal, and O(1) peek.
 */
export class PriorityQueue {
  private readonly heap: Schedule[] = [];

  /**
   * Inserts a schedule into the priority queue.
   */
  enqueue(schedule: Schedule): void {
    const time = schedule.nextRunAt?.getTime();
    if (typeof time !== "number" || Number.isNaN(time)) {
      // Every heap comparison against NaN is false, so an invalid date never
      // sinks: it parks itself at the head of the queue and blocks everything
      // genuinely due behind it.
      throw new RangeError(
        `Cannot enqueue schedule "${schedule.id}": nextRunAt is not a valid date`,
      );
    }
    this.heap.push(schedule);
    this.bubbleUp(this.heap.length - 1);
  }

  /**
   * Removes and returns the earliest schedule.
   */
  dequeue(): Schedule | undefined {
    if (this.heap.length === 0) {
      return undefined;
    }

    const top = this.heap[0]!;
    const last = this.heap.pop();

    if (this.heap.length > 0 && last !== undefined) {
      this.heap[0] = last;
      this.sinkDown(0);
    }

    return top;
  }

  /**
   * Returns the earliest schedule without removing it.
   */
  peek(): Schedule | undefined {
    if (this.heap.length === 0) {
      return undefined;
    }
    return this.heap[0];
  }

  /**
   * Removes a schedule by ID.
   */
  remove(id: string): boolean {
    const index = this.heap.findIndex((schedule) => schedule.id === id);
    if (index === -1) {
      return false;
    }

    const last = this.heap.pop();

    if (index < this.heap.length && last !== undefined) {
      this.heap[index] = last;
      // Bubble first; if it moved, the element now at `index` is an ancestor
      // of that subtree and cannot sink, so sinking is a no-op. If it did not
      // move, sinking is the correction that is needed.
      this.bubbleUp(index);
      this.sinkDown(index);
    }

    return true;
  }

  /** Returns true when a schedule with the given id is queued. */
  has(id: string): boolean {
    return this.heap.some((schedule) => schedule.id === id);
  }

  /**
   * Returns the number of schedules in the queue.
   */
  get size(): number {
    return this.heap.length;
  }

  /**
   * Determines whether the queue is empty.
   */
  get isEmpty(): boolean {
    return this.heap.length === 0;
  }

  /**
   * Clears all schedules from the queue.
   */
  clear(): void {
    this.heap.length = 0;
  }

  /**
   * Orders two schedules: earlier fire time first, then higher priority.
   *
   * @returns A negative number when `a` should run before `b`.
   */
  private compare(a: Schedule, b: Schedule): number {
    const byTime = a.nextRunAt.getTime() - b.nextRunAt.getTime();
    if (byTime !== 0) return byTime;
    return (b.options?.priority ?? 0) - (a.options?.priority ?? 0);
  }

  /**
   * Bubble up an element to maintain heap property.
   */
  private bubbleUp(index: number): void {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      const parent = this.heap[parentIndex]!;
      const current = this.heap[index]!;

      if (this.compare(current, parent) < 0) {
        [this.heap[parentIndex], this.heap[index]] = [current, parent];
        index = parentIndex;
      } else {
        break;
      }
    }
  }

  /**
   * Sink down an element to maintain heap property.
   */
  private sinkDown(index: number): void {
    while (true) {
      let smallest = index;
      const left = 2 * index + 1;
      const right = 2 * index + 2;

      if (
        left < this.heap.length &&
        this.compare(this.heap[left]!, this.heap[smallest]!) < 0
      ) {
        smallest = left;
      }

      if (
        right < this.heap.length &&
        this.compare(this.heap[right]!, this.heap[smallest]!) < 0
      ) {
        smallest = right;
      }

      if (smallest !== index) {
        [this.heap[smallest]!, this.heap[index]!] = [
          this.heap[index]!,
          this.heap[smallest]!,
        ];
        index = smallest;
      } else {
        break;
      }
    }
  }
}
