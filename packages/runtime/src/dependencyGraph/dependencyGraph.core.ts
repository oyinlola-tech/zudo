import type {
  DependencyGraph,
  DependencyNode,
  DependencyResolutionResult,
  CircularDependencyInfo,
} from "./dependencyGraph.type.js";

import {
  RuntimeCircularDependencyError,
  RuntimeDependencyError,
} from "../runtimeError/runtimeError.base.js";

/**
 * Builds a dependency graph from module IDs and their dependencies.
 */
export function buildDependencyGraph(
  modules: ReadonlyMap<string, readonly string[]>,
): DependencyGraph {
  const nodes = new Map<string, DependencyNode>();
  const circularDependencies: CircularDependencyInfo[] = [];

  // Build nodes
  for (const [moduleId, deps] of modules) {
    nodes.set(moduleId, {
      moduleId,
      dependencies: deps,
      dependents: [],
      depth: 0,
    });
  }

  // Populate dependents
  for (const [moduleId, node] of nodes) {
    for (const depId of node.dependencies) {
      const depNode = nodes.get(depId);
      if (depNode) {
        (depNode.dependents as string[]).push(moduleId);
      }
    }
  }

  // Calculate depths and detect cycles
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const order: string[] = [];

  function calculateDepth(moduleId: string, path: string[] = []): number {
    if (recursionStack.has(moduleId)) {
      const cycleStart = path.indexOf(moduleId);
      const cycle = path.slice(cycleStart);
      circularDependencies.push({
        cycle,
        moduleId,
        dependencyId: path[path.length - 1] ?? moduleId,
      });
      return 0;
    }

    if (visited.has(moduleId)) {
      return nodes.get(moduleId)?.depth ?? 0;
    }

    visited.add(moduleId);
    recursionStack.add(moduleId);

    const node = nodes.get(moduleId);
    if (!node) {
      recursionStack.delete(moduleId);
      return 0;
    }

    let maxDepth = 0;
    for (const depId of node.dependencies) {
      const depDepth = calculateDepth(depId, [...path, moduleId]);
      maxDepth = Math.max(maxDepth, depDepth + 1);
    }

    (node as { depth: number }).depth = maxDepth;

    recursionStack.delete(moduleId);
    order.push(moduleId);

    return maxDepth;
  }

  for (const moduleId of nodes.keys()) {
    if (!visited.has(moduleId)) {
      calculateDepth(moduleId);
    }
  }

  // Sort by depth for initialization order
  const ordered = [...nodes.entries()]
    .sort(([, a], [, b]) => a.depth - b.depth)
    .map(([id]) => id);

  return Object.freeze({
    nodes: Object.freeze(new Map(nodes)),
    ordered: Object.freeze(ordered),
    hasCircularDependency: circularDependencies.length > 0,
    circularDependencies: Object.freeze(
      circularDependencies.map((c) => c.cycle),
    ),
  });
}

/**
 * Resolves module dependencies into an initialization order.
 *
 * Missing dependencies are rejected before ordering. Previously an
 * unregistered dependency contributed depth `0` and was silently
 * dropped, so a typo in a module's `dependencies` degraded into an
 * unordered start that failed later inside `onInitialize`.
 */
export function resolveDependencies(
  modules: ReadonlyMap<string, readonly string[]>,
): DependencyResolutionResult {
  validateDependencies(modules);

  const graph = buildDependencyGraph(modules);

  if (graph.hasCircularDependency) {
    throw new RuntimeCircularDependencyError(
      graph.circularDependencies[0] ?? [],
    );
  }

  // Group modules by depth for parallel initialization
  const depthGroups = new Map<number, string[]>();

  for (const [moduleId, node] of graph.nodes) {
    const group = depthGroups.get(node.depth) ?? [];
    group.push(moduleId);
    depthGroups.set(node.depth, group);
  }

  const parallelGroups = [...depthGroups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, modules]) => Object.freeze(modules));

  return Object.freeze({
    order: graph.ordered,
    parallelGroups: Object.freeze(parallelGroups),
    hasCircularDependency: false,
    circularDependencies: [],
  });
}

/**
 * Validates that all module dependencies exist.
 *
 * @throws {RuntimeDependencyError} naming both the module and the
 * dependency it declared. Reporting a missing dependency as a circular
 * one, as this previously did, sends the reader looking for a cycle that
 * does not exist.
 */
export function validateDependencies(
  modules: ReadonlyMap<string, readonly string[]>,
): void {
  for (const [moduleId, deps] of modules) {
    for (const depId of deps) {
      if (!modules.has(depId)) {
        throw new RuntimeDependencyError(moduleId, depId);
      }
    }
  }
}
