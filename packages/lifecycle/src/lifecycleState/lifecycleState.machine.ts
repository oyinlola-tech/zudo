/**
 * @zudojs/lifecycle/state-machine
 *
 * Lifecycle state machine — validates transitions and tracks current state.
 */

import { LifecycleState, LIFECYCLE_VALID_TRANSITIONS } from "@zudojs/constants";
import { LifecycleStateError } from "@zudojs/errors";

/**
 * Manages lifecycle state transitions for a single entity.
 * Validates transitions against the allowed transition map.
 */
export class LifecycleStateMachine {
  private _state: LifecycleState = LifecycleState.IDLE;

  constructor(private readonly _id: string) {}

  /** Returns the current state. */
  public get state(): LifecycleState {
    return this._state;
  }

  /** Returns whether the entity is in a terminal state. */
  public get isTerminal(): boolean {
    return (
      this._state === LifecycleState.DISPOSED ||
      this._state === LifecycleState.STOPPED
    );
  }

  /** Returns whether the entity is in a running state. */
  public get isRunning(): boolean {
    return (
      this._state === LifecycleState.STARTED ||
      this._state === LifecycleState.READY
    );
  }

  /**
   * Transitions to a new state.
   * Throws LifecycleStateError if the transition is invalid.
   */
  public transition(to: LifecycleState): void {
    if (!this.canTransition(to)) {
      throw new LifecycleStateError(this._state, to, this._id);
    }
    this._state = to;
  }

  /**
   * Checks whether a transition to the given state is valid.
   */
  public canTransition(to: LifecycleState): boolean {
    const allowed = LIFECYCLE_VALID_TRANSITIONS[this._state];
    return allowed.includes(to);
  }

  /**
   * Force-sets the state without validation.
   * Use only for initialization or error recovery.
   */
  public forceState(state: LifecycleState): void {
    this._state = state;
  }
}
