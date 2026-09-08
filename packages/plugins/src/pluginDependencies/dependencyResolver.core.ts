import type { PluginDependency } from "../pluginTypes/pluginDependency.type.js";
import {
  PluginDependencyCycleError,
  PluginDependencyError,
} from "@zudojs/errors";

/**
 * The dependency shape the resolver needs from a plugin.
 */
export interface ResolvablePlugin {
  readonly dependencies?: readonly PluginDependency[];
  readonly optionalDependencies?: readonly PluginDependency[];
}

/**
 * A dependency that could not be satisfied.
 */
export interface MissingDependency {
  /** The plugin that declared the dependency. */
  readonly plugin: string;
  /** The dependency it needs. */
  readonly dependency: string;
}

/**
 * Result of dependency resolution.
 */
export interface DependencyResolution {
  readonly ordered: readonly string[];

  /**
   * Names of required dependencies that are not registered.
   *
   * Retained as plain names for compatibility; {@link missingDetails}
   * also records which plugin declared each one.
   */
  readonly missing: readonly string[];

  /** Missing dependencies, with the plugin that declared each. */
  readonly missingDetails: readonly MissingDependency[];

  readonly cycles: readonly string[];
}

/**
 * Resolves plugin dependencies and determines startup order.
 */
export class DependencyResolver {
  /**
   * Resolves dependencies for the given plugins.
   *
   * Optional dependencies that are present participate in ordering — a
   * plugin that optionally integrates with a peer must still start after
   * it — while optional dependencies that are absent are ignored rather
   * than reported missing.
   */
  public resolve(plugins: Map<string, ResolvablePlugin>): DependencyResolution {
    const missingDetails: MissingDependency[] = [];
    const cycles: string[] = [];

    for (const [name, plugin] of plugins) {
      for (const dep of plugin.dependencies ?? []) {
        if (!plugins.has(dep.name)) {
          missingDetails.push({ plugin: name, dependency: dep.name });
        }
      }
    }

    const missing = missingDetails.map((entry) => entry.dependency);

    if (missingDetails.length > 0) {
      return Object.freeze({
        ordered: Object.freeze([]),
        missing: Object.freeze(missing),
        missingDetails: Object.freeze(missingDetails),
        cycles: Object.freeze(cycles),
      });
    }

    const order = this.topologicalOrder(plugins, cycles);

    if (cycles.length > 0) {
      return Object.freeze({
        ordered: Object.freeze([]),
        missing: Object.freeze(missing),
        missingDetails: Object.freeze(missingDetails),
        cycles: Object.freeze(cycles),
      });
    }

    return Object.freeze({
      ordered: Object.freeze(order),
      missing: Object.freeze(missing),
      missingDetails: Object.freeze(missingDetails),
      cycles: Object.freeze(cycles),
    });
  }

  /**
   * Returns the edges a plugin depends on, in declaration order.
   *
   * Only dependencies that are actually registered become edges, so an
   * absent optional dependency does not create a dangling node.
   */
  private edgesFor(
    name: string,
    plugins: Map<string, ResolvablePlugin>,
  ): readonly string[] {
    const plugin = plugins.get(name);
    if (!plugin) {
      return [];
    }

    const edges: string[] = [];

    for (const dep of plugin.dependencies ?? []) {
      if (plugins.has(dep.name)) {
        edges.push(dep.name);
      }
    }

    for (const dep of plugin.optionalDependencies ?? []) {
      if (plugins.has(dep.name) && !edges.includes(dep.name)) {
        edges.push(dep.name);
      }
    }

    return edges;
  }

  /**
   * Produces a dependency-first ordering, recording any cycles found.
   *
   * The traversal keeps its own stack rather than recursing, so a deep
   * dependency chain reports a graph result instead of overflowing.
   */
  private topologicalOrder(
    plugins: Map<string, ResolvablePlugin>,
    cycles: string[],
  ): string[] {
    const visited = new Set<string>();
    const onStack = new Set<string>();
    const order: string[] = [];

    for (const root of plugins.keys()) {
      if (visited.has(root)) {
        continue;
      }

      // Each frame tracks how many of the node's edges have been walked.
      const stack: { name: string; edgeIndex: number; path: string[] }[] = [
        { name: root, edgeIndex: 0, path: [root] },
      ];
      onStack.add(root);

      while (stack.length > 0) {
        const frame = stack[stack.length - 1]!;
        const edges = this.edgesFor(frame.name, plugins);

        if (frame.edgeIndex >= edges.length) {
          onStack.delete(frame.name);
          visited.add(frame.name);
          order.push(frame.name);
          stack.pop();
          continue;
        }

        const next = edges[frame.edgeIndex]!;
        frame.edgeIndex += 1;

        if (onStack.has(next)) {
          const start = frame.path.indexOf(next);
          const cycle =
            start >= 0 ? frame.path.slice(start) : [next, frame.name];
          cycles.push([...cycle, next].join(" -> "));

          // Unwind: an ordering cannot be produced for a cyclic graph.
          for (const remaining of stack) {
            onStack.delete(remaining.name);
          }
          stack.length = 0;
          break;
        }

        if (visited.has(next)) {
          continue;
        }

        onStack.add(next);
        stack.push({
          name: next,
          edgeIndex: 0,
          path: [...frame.path, next],
        });
      }

      if (cycles.length > 0) {
        break;
      }
    }

    return order;
  }
}

/**
 * Throws if the dependency resolution has errors.
 *
 * The thrown error names both the plugin that declared the dependency
 * and the dependency itself, so a startup failure says who needed what.
 */
export function assertResolutionValid(resolution: DependencyResolution): void {
  const missing = resolution.missingDetails[0];

  if (missing) {
    throw new PluginDependencyError(missing.plugin, missing.dependency);
  }

  if (resolution.missing.length > 0) {
    throw new PluginDependencyError(
      resolution.missing[0]!,
      resolution.missing[0]!,
    );
  }

  if (resolution.cycles.length > 0) {
    throw new PluginDependencyCycleError(resolution.cycles[0]!.split(" -> "));
  }
}
