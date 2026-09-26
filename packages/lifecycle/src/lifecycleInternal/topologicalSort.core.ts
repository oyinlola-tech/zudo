/**
 * @zudojs/lifecycle/internal/topological-sort
 *
 * Topological sort for dependency-aware ordering with priority support.
 */

import type { DependencyGraph } from "./dependencyGraph.core.js";
import { LifecycleDependencyError } from "@zudojs/errors";

/** A sorted stage — components that can run in parallel. */
export type TopologicalStage = readonly string[];

/**
 * Performs topological sort on a dependency graph,
 * grouping independent components into parallel stages.
 * Components within the same stage are ordered by priority (higher
 * first) and then by the order they were added to the graph.
 *
 * Runs in O(V + E) — each node is queued once when its last dependency
 * is placed. A rescan of every remaining node per stage made a long
 * chain quadratic (a 20 000-component chain took seconds to order).
 *
 * Throws LifecycleDependencyError, naming the actual loop, when the
 * graph is cyclic. The error used to list every node that was still
 * blocked, which for one three-node loop meant naming the whole
 * application. Undeclared nodes (see `DependencyGraph.validate`) sort
 * as leaves.
 */
export function topologicalSort(
  graph: DependencyGraph,
  priorities?: ReadonlyMap<string, number>,
): readonly TopologicalStage[] {
  const nodes = graph.getNodes();
  const position = new Map<string, number>();
  const inDegree = new Map<string, number>();
  let ready: string[] = [];

  nodes.forEach((node, index) => {
    position.set(node, index);
    const degree = graph.getDependencies(node).length;
    inDegree.set(node, degree);
    if (degree === 0) ready.push(node);
  });

  const byPriorityThenPosition = (a: string, b: string): number => {
    const pa = priorities?.get(a) ?? 0;
    const pb = priorities?.get(b) ?? 0;
    return pb - pa || position.get(a)! - position.get(b)!;
  };

  const stages: TopologicalStage[] = [];
  let placed = 0;

  while (ready.length > 0) {
    ready.sort(byPriorityThenPosition);
    stages.push(Object.freeze(ready));
    placed += ready.length;

    const next: string[] = [];
    for (const node of ready) {
      for (const dependent of graph.getDependents(node)) {
        const remaining = (inDegree.get(dependent) ?? 0) - 1;
        inDegree.set(dependent, remaining);
        if (remaining === 0) next.push(dependent);
      }
    }
    ready = next;
  }

  if (placed < nodes.length) {
    const cycle = graph.findCycle();
    throw new LifecycleDependencyError(
      cycle ?? nodes.filter((node) => (inDegree.get(node) ?? 0) > 0),
    );
  }

  return stages;
}

/**
 * Performs reverse topological sort for shutdown ordering.
 *
 * Both the stage list AND each stage's contents are reversed, so a
 * shutdown is the exact mirror of the startup order: within a stage the
 * lowest-priority component is torn down first and the highest-priority
 * one last. Only the stage list used to be reversed, which left every
 * stage in descending-priority order — harmless while stages ran fully
 * concurrently, but wrong now that priority is a real sub-stage barrier.
 */
export function reverseTopologicalSort(
  graph: DependencyGraph,
  priorities?: ReadonlyMap<string, number>,
): readonly TopologicalStage[] {
  const stages = topologicalSort(graph, priorities);
  return Object.freeze(
    [...stages].reverse().map((stage) => Object.freeze([...stage].reverse())),
  );
}
