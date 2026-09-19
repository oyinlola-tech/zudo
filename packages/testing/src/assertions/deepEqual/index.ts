/**
 * @zudojs/testing — Structural equality barrel.
 *
 * `deepEqual`/`findDifference` compare values structurally, including Maps,
 * Sets, typed arrays, Errors, boxed primitives and class instances (by
 * prototype). `describeValue` renders values for assertion messages.
 *
 * @module assertions/deepEqual
 */

export { deepEqual, findDifference } from "./deepEqual.core.js";
export { describeValue } from "./deepEqual.describe.js";
export type { Difference } from "./deepEqual.describe.js";
