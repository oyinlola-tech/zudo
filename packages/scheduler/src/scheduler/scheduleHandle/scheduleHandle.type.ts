import type { ScheduleState } from "../types/schedulerTypes.core.js";

/**
 * Handle for controlling a schedule.
 */
export interface ScheduleHandle {
  readonly id: string;

  state: ScheduleState;

  pause(): Promise<void>;

  resume(): Promise<void>;

  cancel(): Promise<void>;

  nextRun(): Date | undefined;
}

/**
 * The scheduler operations a handle needs to act on its schedule.
 *
 * Without these the handle is a detached object: `cancel()` sets a local field
 * and the job still runs.
 */
export interface ScheduleHandleBinding {
  /** Applies a state transition to the live schedule. */
  setState(state: ScheduleState): void;
  /** Reads the live schedule's state, or undefined once it is gone. */
  getState(): ScheduleState | undefined;
  /** Reads the live schedule's next fire time. */
  getNextRun(): Date | undefined;
  /** Aborts any execution of this schedule that is currently in flight. */
  abortRunning(): void;
}

/**
 * Implementation of ScheduleHandle.
 *
 * Bound to its scheduler, so pause, resume and cancel reach the queue. An
 * unbound handle (the two-argument form) still tracks state locally, which
 * keeps it usable in tests that do not involve a scheduler.
 */
export class ScheduleHandleImpl implements ScheduleHandle {
  readonly id: string;

  private _state: ScheduleState;

  private readonly binding: ScheduleHandleBinding | undefined;

  constructor(
    id: string,
    state: ScheduleState,
    binding?: ScheduleHandleBinding,
  ) {
    this.id = id;
    this._state = state;
    this.binding = binding;
  }

  /** The schedule's current state, read from the scheduler when bound. */
  get state(): ScheduleState {
    return this.binding?.getState() ?? this._state;
  }

  set state(next: ScheduleState) {
    this._state = next;
    this.binding?.setState(next);
  }

  pause(): Promise<void> {
    this.state = "paused";
    return Promise.resolve();
  }

  resume(): Promise<void> {
    this.state = "active";
    return Promise.resolve();
  }

  cancel(): Promise<void> {
    // Abort first: a job already running should stop, not just be removed from
    // future scheduling.
    this.binding?.abortRunning();
    this._state = "cancelled";
    this.binding?.setState("cancelled");
    return Promise.resolve();
  }

  nextRun(): Date | undefined {
    return this.binding?.getNextRun();
  }
}
