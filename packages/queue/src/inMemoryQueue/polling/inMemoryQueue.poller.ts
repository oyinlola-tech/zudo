/**
 * The in-memory queue's poll loop.
 *
 * A tick promotes due delayed jobs, claims runnable ones and reclaims stalled
 * ones. Three defects lived here: `pollInterval` applied to the first tick
 * only (every later tick used a built-in 50 ms that backed off to 2 s while
 * idle), nothing woke the loop when work arrived (so an add after an idle
 * spell waited out the back-off), and every timer was unreferenced (so a
 * script whose only work was a queue exited before any job ran).
 *
 * @module inMemoryQueue/polling/inMemoryQueue.poller
 */

/** First interval, and the floor of the idle back-off, when none is set. */
export const DEFAULT_POLL_INTERVAL_MS = 50;

/** Ceiling of the idle back-off when no `pollInterval` is set. */
export const MAX_IDLE_POLL_INTERVAL_MS = 2_000;

/** How long the loop must find nothing before an unset interval backs off. */
const IDLE_BEFORE_BACKOFF_MS = 500;

/** What the poller drives. */
export interface QueuePollerOptions {
  /**
   * A fixed interval between ticks. When set it is used for every tick;
   * when unset the interval starts at {@link DEFAULT_POLL_INTERVAL_MS} and
   * backs off while idle.
   */
  readonly pollInterval?: number;
  /** Runs one tick. Resolves true when it dispatched any job. */
  readonly tick: () => Promise<boolean>;
  /** Whether the loop should keep running at all. */
  readonly isLive: () => boolean;
  /** Whether the armed timer should hold the process open. */
  readonly shouldKeepAlive: () => boolean;
}

/**
 * Drives a queue's ticks: a fixed or backing-off interval, an immediate
 * `wake()` when work may have arrived, and at most one tick at a time.
 */
export class QueuePoller {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private armedDelay = 0;
  private ticking = false;
  private wakeRequested = false;
  private backoffMs = DEFAULT_POLL_INTERVAL_MS;
  private emptySince = 0;

  constructor(private readonly options: QueuePollerOptions) {}

  /** Whether a tick is armed or running. */
  get isRunning(): boolean {
    return this.timer !== null || this.ticking;
  }

  /** Arms the first tick, unless the loop is already running. */
  start(): void {
    if (this.isRunning) return;
    this.arm(this.options.pollInterval ?? DEFAULT_POLL_INTERVAL_MS);
  }

  /** Runs a tick as soon as possible, and clears the idle back-off. */
  wake(): void {
    this.resetBackoff();
    if (!this.options.isLive()) return;
    if (this.ticking) {
      this.wakeRequested = true;
      return;
    }
    if (this.timer !== null && this.armedDelay === 0) {
      // Already due; the work that woke us may change whether it holds the
      // process open.
      this.applyKeepAlive();
      return;
    }
    this.arm(0);
  }

  /** Clears the idle back-off without arming anything. */
  resetBackoff(): void {
    this.backoffMs = DEFAULT_POLL_INTERVAL_MS;
    this.emptySince = 0;
  }

  /** Disarms the loop. A tick already running finishes but re-arms nothing. */
  stop(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.wakeRequested = false;
    this.resetBackoff();
  }

  private arm(delay: number): void {
    if (!this.options.isLive()) return;
    if (this.timer !== null) clearTimeout(this.timer);

    this.armedDelay = delay;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.run();
    }, delay);

    this.applyKeepAlive();
  }

  /**
   * Referenced while there is work a consumer can run, so the process waits
   * for it; unreferenced otherwise, so an idle queue never holds it open.
   */
  private applyKeepAlive(): void {
    if (this.timer === null) return;
    if (this.options.shouldKeepAlive()) this.timer.ref?.();
    else this.timer.unref?.();
  }

  private async run(): Promise<void> {
    this.ticking = true;
    let dispatched = false;
    try {
      dispatched = await this.options.tick();
    } catch {
      // A tick never rejects by design; a defect must not stop the loop.
    } finally {
      this.ticking = false;
    }

    if (!this.options.isLive() || this.timer !== null) return;
    const woken = this.wakeRequested;
    this.wakeRequested = false;
    this.arm(woken ? 0 : this.nextDelay(dispatched));
  }

  private nextDelay(dispatched: boolean): number {
    if (this.options.pollInterval !== undefined) {
      return Math.max(0, this.options.pollInterval);
    }
    if (dispatched) {
      this.resetBackoff();
    } else if (this.emptySince === 0) {
      this.emptySince = Date.now();
    } else if (Date.now() - this.emptySince > IDLE_BEFORE_BACKOFF_MS) {
      this.backoffMs = Math.min(this.backoffMs * 2, MAX_IDLE_POLL_INTERVAL_MS);
    }
    return this.backoffMs;
  }
}
