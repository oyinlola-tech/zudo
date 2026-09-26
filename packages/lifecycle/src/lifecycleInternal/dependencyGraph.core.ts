/**
 * @zudojs/lifecycle/internal/dependency-graph
 *
 * Directed acyclic graph for component dependency tracking.
 */

import {
  ErrorCode,
  LifecycleDependencyError,
  LifecycleError,
} from "@zudojs/errors";
import { findDependencyCycle } from "./dependencyGraph.cycle.js";

/** Options for {@link DependencyGraph.validate}. */
export interface DependencyGraphValidationOptions {
  /**
   * Also reject nodes that only appear as an edge endpoint and were
   * never passed to `addNode`. Off by default, because `addEdge` has
   * always created its endpoints; turn it on when the node set is
   * known up front (the registry does its own equivalent check on
   * `dependsOn` and names the missing registration).
   */
  readonly requireDeclared?: boolean;
}

/**
 * A directed acyclic graph of component dependencies.
 *
 * `addEdge` creates any endpoint it has not seen, so an undeclared
 * node (a typo in a dependency id, say) sorts as a leaf in the first
 * stage. The graph remembers which nodes were declared with `addNode`:
 * inspect them with `getUndeclaredNodes()` or reject them with
 * `validate({ requireDeclared: true })`.
 */
export class DependencyGraph {
  private readonly _edges = new Map<string, Set<string>>();
  private readonly _reverseEdges = new Map<string, Set<string>>();
  private readonly _declared = new Set<string>();

  /** Declares a node in the graph. */
  public addNode(id: string): void {
    this._declared.add(id);
    this.ensureNode(id);
  }

  /** Adds a directed edge: from depends on to. */
  public addEdge(from: string, to: string): void {
    this.ensureNode(from);
    this.ensureNode(to);
    this._edges.get(from)!.add(to);
    this._reverseEdges.get(to)!.add(from);
  }

  /** Returns all nodes, declared or not, in insertion order. */
  public getNodes(): readonly string[] {
    return [...this._edges.keys()];
  }

  /** Returns the nodes that the given node depends on. */
  public getDependencies(id: string): readonly string[] {
    return [...(this._edges.get(id) ?? [])];
  }

  /** Returns the nodes that depend on the given node. */
  public getDependents(id: string): readonly string[] {
    return [...(this._reverseEdges.get(id) ?? [])];
  }

  /** Returns the nodes referenced by an edge but never passed to `addNode`. */
  public getUndeclaredNodes(): readonly string[] {
    return this.getNodes().filter((id) => !this._declared.has(id));
  }

  /**
   * Validates that the graph has no circular dependencies, throwing
   * LifecycleDependencyError with the cycle path if one is found. With
   * `requireDeclared` it first throws LifecycleError
   * (LIFECYCLE_DEPENDENCY) for an edge to a node that was never added.
   */
  public validate(options: DependencyGraphValidationOptions = {}): void {
    if (options.requireDeclared === true) {
      this.assertDeclared();
    }

    const cycle = this.findCycle();
    if (cycle !== undefined) {
      throw new LifecycleDependencyError(cycle);
    }
  }

  /**
   * Returns one dependency cycle as a closed path (first id repeated
   * last), or undefined when the graph is acyclic.
   */
  public findCycle(): readonly string[] | undefined {
    return findDependencyCycle(this);
  }

  private ensureNode(id: string): void {
    if (!this._edges.has(id)) {
      this._edges.set(id, new Set());
    }
    if (!this._reverseEdges.has(id)) {
      this._reverseEdges.set(id, new Set());
    }
  }

  private assertDeclared(): void {
    const undeclared = this.getUndeclaredNodes();
    const missing = undeclared[0];
    if (missing === undefined) return;

    const dependent = this.getDependents(missing)[0];

    throw new LifecycleError(
      `Component "${dependent ?? missing}" depends on "${missing}" which was never added to the graph.`,
      {
        code: ErrorCode.LIFECYCLE_DEPENDENCY,
        componentId: dependent,
        metadata: { dependency: missing, undeclared },
      },
    );
  }
}
