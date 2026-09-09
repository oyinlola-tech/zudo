/**
 * @zudojs/lifecycle/phase
 *
 * Lifecycle phase ordering for startup and shutdown sequences.
 */

import { LifecyclePhase } from "@zudojs/constants";

/** Ordered phases for startup. */
export const STARTUP_PHASES: readonly LifecyclePhase[] = Object.freeze([
  LifecyclePhase.INITIALIZE,
  LifecyclePhase.START,
  LifecyclePhase.READY,
]);

/** Ordered phases for shutdown (reversed). */
export const SHUTDOWN_PHASES: readonly LifecyclePhase[] = Object.freeze([
  LifecyclePhase.STOP,
  LifecyclePhase.DISPOSE,
]);

/**
 * Returns the phase hook name for a given lifecycle phase.
 */
export function getPhaseHookName(phase: LifecyclePhase): string {
  switch (phase) {
    case LifecyclePhase.INITIALIZE:
      return "initialize";
    case LifecyclePhase.START:
      return "start";
    case LifecyclePhase.READY:
      return "ready";
    case LifecyclePhase.STOP:
      return "stop";
    case LifecyclePhase.DISPOSE:
      return "dispose";
  }
}

/**
 * Returns the name of the LifecycleComponent method a phase invokes.
 *
 * This is the same mapping as {@link getPhaseHookName}; the two names
 * exist for readability at the call site. The doc comment previously
 * claimed an "on-prefixed" name, which this function has never
 * returned — component hooks are `initialize`, `start`, `ready`,
 * `stop` and `dispose`.
 */
export function getComponentMethod(phase: LifecyclePhase): string {
  return getPhaseHookName(phase);
}
