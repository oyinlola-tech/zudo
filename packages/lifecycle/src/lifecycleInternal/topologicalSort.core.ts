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
 * Components within the same stage are ordered by priority (higher first).
 */
export function topologicalSort(
  graph: DependencyGraph,
  priorities?: ReadonlyMap<string, number>,
): readonly TopologicalStage[] {
  const nodes = graph.getNodes();
  const inDegree = new Map<string, number>();

  for (const node of nodes) {
    const deps = graph.getDependencies(node);
    inDegree.set(node, deps.length);
  }

  const stages: TopologicalStage[] = [];
  const remaining = new Set(nodes);

  while (remaining.size > 0) {
    const ready = [...remaining].filter((node) => inDegree.get(node) === 0);

    if (ready.length === 0 && remaining.size > 0) {
      throw new LifecycleDependencyError([...remaining]);
    }

    ready.sort((a, b) => {
      const pa = priorities?.get(a) ?? 0;
      const pb = priorities?.get(b) ?? 0;
      return pb - pa;
    });

    stages.push(Object.freeze(ready));

    for (const node of ready) {
      remaining.delete(node);
      const dependents = graph.getDependents(node);
      for (const dep of dependents) {
        const current = inDegree.get(dep) ?? 0;
        inDegree.set(dep, current - 1);
      }
    }
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
