import type { ModuleId } from "../module.js";

import type { ModuleDependencyGraph } from "./moduleDependency.type.js";

import {
  CircularModuleDependencyError,
  MissingModuleDependencyError,
} from "../moduleError/moduleError.dependency.js";

/**
 * Detects circular dependencies in a module graph.
 *
 * Returns the dependency cycle when one exists.
 *
 * This is the single cycle-detection mechanism used by the
 * dependency subsystem. The implementation is iterative so very
 * deep graphs cannot overflow the call stack.
 */
export function findModuleDependencyCycle(
  graph: ModuleDependencyGraph,
): readonly ModuleId[] | undefined {
  const visited = new Set<ModuleId>();

  for (const startId of graph.nodes.keys()) {
    if (visited.has(startId)) continue;

    /*
     * Iterative DFS. Each stack frame tracks the module and the
     * index of the next dependency to visit.
     */
    const stack: { id: ModuleId; nextDependency: number }[] = [
      { id: startId, nextDependency: 0 },
    ];
    const inPath = new Set<ModuleId>([startId]);
    const path: ModuleId[] = [startId];

    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      const dependencies = graph.getDependencies(frame.id);

      if (frame.nextDependency >= dependencies.length) {
        stack.pop();
        path.pop();
        inPath.delete(frame.id);
        visited.add(frame.id);
        continue;
      }

      const dependency = dependencies[frame.nextDependency]!;
      frame.nextDependency += 1;

      if (!graph.hasModule(dependency.id)) continue;

      if (inPath.has(dependency.id)) {
        const index = path.indexOf(dependency.id);
        return [...path.slice(index), dependency.id];
      }

      if (visited.has(dependency.id)) continue;

      stack.push({ id: dependency.id, nextDependency: 0 });
      inPath.add(dependency.id);
      path.push(dependency.id);
    }
  }

  return undefined;
}

/**
 * Returns true when the graph contains a circular dependency.
 */
export function hasModuleDependencyCycle(
  graph: ModuleDependencyGraph,
): boolean {
  return findModuleDependencyCycle(graph) !== undefined;
}

/**
 * Returns a topological startup order for the graph.
 *
 * Dependencies appear before the modules that depend on them.
 *
 * Example:
 *
 * users
 *   ↓
 * orders
 *   ↓
 * payments
 *
 * produces:
 *
 * users → orders → payments
 *
 * The sort is implemented iteratively (Kahn's algorithm). When
 * not every module can be ordered, the cycle is located with
 * findModuleDependencyCycle and reported.
 */
export function resolveModuleStartupOrder(
  graph: ModuleDependencyGraph,
): readonly ModuleId[] {
  /*
   * Missing required dependencies make the order meaningless,
   * so they are reported first with the requiring module.
   */
  for (const node of graph.nodes.values()) {
    for (const dependency of node.dependencies) {
      if (dependency.optional) continue;
      if (!graph.hasModule(dependency.id)) {
        throw new MissingModuleDependencyError(node.id, dependency.id);
      }
    }
  }

  const inDegree = new Map<ModuleId, number>();
  const dependents = new Map<ModuleId, ModuleId[]>();

  for (const node of graph.nodes.values()) {
    let degree = 0;

    for (const dependency of node.dependencies) {
      if (!graph.hasModule(dependency.id)) continue;
      degree += 1;

      const list = dependents.get(dependency.id);
      if (list) list.push(node.id);
      else dependents.set(dependency.id, [node.id]);
    }

    inDegree.set(node.id, degree);
  }

  const queue: ModuleId[] = [];
  for (const [moduleId, degree] of inDegree) {
    if (degree === 0) queue.push(moduleId);
  }

  const order: ModuleId[] = [];

  for (let index = 0; index < queue.length; index++) {
    const moduleId = queue[index]!;
    order.push(moduleId);

    for (const dependent of dependents.get(moduleId) ?? []) {
      const degree = (inDegree.get(dependent) ?? 0) - 1;
      inDegree.set(dependent, degree);
      if (degree === 0) queue.push(dependent);
    }
  }

  if (order.length !== graph.nodes.size) {
    const cycle = findModuleDependencyCycle(graph);
    throw new CircularModuleDependencyError(
      cycle ?? [...graph.nodes.keys()].filter((id) => !order.includes(id)),
    );
  }

  return Object.freeze(order);
}

/**
 * Returns a topological shutdown order.
 *
 * Shutdown is the reverse of startup so dependent modules
 * are stopped before the modules they depend on.
 */
export function resolveModuleShutdownOrder(
  graph: ModuleDependencyGraph,
): readonly ModuleId[] {
  return Object.freeze([...resolveModuleStartupOrder(graph)].reverse());
}
