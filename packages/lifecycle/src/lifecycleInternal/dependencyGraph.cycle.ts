/**
 * @zudojs/lifecycle/internal/dependency-graph/cycle
 *
 * Iterative cycle search over a dependency graph.
 */

/** The part of a graph the search needs. */
export interface CycleSearchGraph {
  getNodes(): readonly string[];
  getDependencies(id: string): readonly string[];
}

/** One frame of the iterative depth-first search. */
interface SearchFrame {
  readonly id: string;
  readonly dependencies: readonly string[];
  next: number;
}

/**
 * Returns one dependency cycle as a closed path (first id repeated
 * last), or undefined when the graph is acyclic.
 *
 * The search is iterative so a very deep graph cannot overflow the
 * call stack, and it reports the actual loop: the topological sort
 * used to list every node that was still blocked, which for one
 * three-node loop meant naming the whole application.
 */
export function findDependencyCycle(
  graph: CycleSearchGraph,
): readonly string[] | undefined {
  const visited = new Set<string>();

  for (const start of graph.getNodes()) {
    if (visited.has(start)) continue;

    const cycle = findCycleFrom(graph, start, visited);
    if (cycle !== undefined) return cycle;
  }

  return undefined;
}

function findCycleFrom(
  graph: CycleSearchGraph,
  start: string,
  visited: Set<string>,
): readonly string[] | undefined {
  const stack: SearchFrame[] = [
    { id: start, dependencies: graph.getDependencies(start), next: 0 },
  ];
  const inPath = new Set<string>([start]);
  const path: string[] = [start];

  while (stack.length > 0) {
    const frame = stack[stack.length - 1]!;

    if (frame.next >= frame.dependencies.length) {
      stack.pop();
      path.pop();
      inPath.delete(frame.id);
      visited.add(frame.id);
      continue;
    }

    const dependency = frame.dependencies[frame.next]!;
    frame.next += 1;

    if (inPath.has(dependency)) {
      return Object.freeze([...path.slice(path.indexOf(dependency)), dependency]);
    }
    if (visited.has(dependency)) continue;

    stack.push({
      id: dependency,
      dependencies: graph.getDependencies(dependency),
      next: 0,
    });
    inPath.add(dependency);
    path.push(dependency);
  }

  return undefined;
}
