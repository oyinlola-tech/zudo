/**
 * Injectable Clock and Random interfaces for deterministic testing.
 *
 * @deprecated `@zudojs/types` owns `Clock`, `Random`, `systemClock` and
 * `systemRandom` (see the type ownership table). Everything here is kept so
 * existing imports keep compiling and will be removed in the next major.
 *
 * @module runtime
 */

export { systemClock, createMockClock } from "./clock.js";
export type { Clock, MockClock } from "./clock.js";

export { systemRandom, createMockRandom } from "./random.js";
export type { Random, RandomSource, MockRandom } from "./random.js";
