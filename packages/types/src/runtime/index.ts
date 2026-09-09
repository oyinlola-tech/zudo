/**
 * @zudojs/types — Runtime primitives barrel.
 *
 * An explicit list rather than `export *`: this was the only barrel in the
 * package without one, so anything newly exported from `runtime.core.ts`
 * silently became public API.
 */

export type {
  Clock,
  ClockSeconds,
  Random,
  PseudoRandom,
} from "./runtime.core.js";
export {
  systemClock,
  systemClockSeconds,
  defineSecureRandom,
  systemRandom,
  FixedClock,
  SeededRandom,
} from "./runtime.core.js";
