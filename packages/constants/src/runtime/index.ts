/**
 * Injectable Clock and Random interfaces for deterministic testing.
 *
 * @module runtime
 */

export { systemClock, createMockClock } from "./clock.js";
export type { Clock, MockClock } from "./clock.js";

export { systemRandom, createMockRandom } from "./random.js";
export type { Random } from "./random.js";
