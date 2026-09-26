/**
 * @zudojs/lifecycle/internal
 *
 * Internal utilities: dependency graph, topological sort, async helpers.
 */

export { DependencyGraph } from "./dependencyGraph.core.js";
export type { DependencyGraphValidationOptions } from "./dependencyGraph.core.js";
export {
  topologicalSort,
  reverseTopologicalSort,
} from "./topologicalSort.core.js";
export type { TopologicalStage } from "./topologicalSort.core.js";
export { withTimeout, withAbort, withConcurrency } from "./asyncUtils.core.js";
export {
  MAX_TIMER_DELAY,
  assertTimeoutBudget,
  isBounded,
  toTimerDelay,
} from "./timeoutBudget.core.js";
