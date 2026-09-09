/**
 * @zudojs/lifecycle/plan
 *
 * Lifecycle execution planner — builds startup/shutdown stages from dependency graph.
 */

import type { LifecyclePhase } from "@zudojs/constants";
import type { LifecycleRegistration } from "../lifecycleComponent/lifecycleComponent.type.js";
import {
  DependencyGraph,
  topologicalSort,
  reverseTopologicalSort,
} from "../lifecycleInternal/index.js";

/** A single execution stage — component IDs that can run in parallel. */
export interface ExecutionStage {
  /** Component IDs in this stage. */
  readonly components: readonly string[];
  /** The lifecycle phase for this stage. */
  readonly phase: LifecyclePhase;
}

/** A complete execution plan for a lifecycle phase. */
export interface ExecutionPlan {
  /** Ordered stages to execute sequentially. */
  readonly stages: readonly ExecutionStage[];
  /** The lifecycle phase. */
  readonly phase: LifecyclePhase;
}

/**
 * Builds an execution plan for a given lifecycle phase.
 */
export function buildExecutionPlan(
  registrations: readonly LifecycleRegistration[],
  phase: LifecyclePhase,
): ExecutionPlan {
  const priorities = new Map<string, number>();
  for (const reg of registrations) {
    priorities.set(reg.id, reg.priority);
  }

  const graph = buildGraphForPhase(registrations);
  const isShutdown = phase === "stop" || phase === "dispose";

  const sorted = isShutdown
    ? reverseTopologicalSort(graph, priorities)
    : topologicalSort(graph, priorities);

  const stages: ExecutionStage[] = sorted.map((stage) => ({
    components: stage,
    phase,
  }));

  return { stages, phase };
}

/**
 * Builds the component dependency graph.
 *
 * The graph is phase-independent: startup and shutdown share the same
 * edges and differ only in traversal direction, which
 * buildExecutionPlan applies.
 */
function buildGraphForPhase(
  registrations: readonly LifecycleRegistration[],
): DependencyGraph {
  const graph = new DependencyGraph();

  for (const reg of registrations) {
    graph.addNode(reg.id);
    for (const dep of reg.dependsOn) {
      graph.addNode(dep);
      graph.addEdge(reg.id, dep);
    }
  }

  return graph;
}
