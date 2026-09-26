/**
 * @zudojs/lifecycle/registry
 *
 * Lifecycle registry — manages component registration, validation, and lookup.
 */

import { LIFECYCLE_DEFAULT_TIMEOUT } from "@zudojs/constants";
import type {
  LifecycleComponent,
  LifecycleRegistration,
  LifecycleRegistrationOptions,
} from "../lifecycleComponent/lifecycleComponent.type.js";
import {
  DependencyGraph,
  assertTimeoutBudget,
} from "../lifecycleInternal/index.js";
import { ErrorCode, LifecycleError } from "@zudojs/errors";

/**
 * Registry for lifecycle components.
 * Validates registration, builds dependency graph, and freezes on demand.
 */
export class LifecycleRegistry {
  private readonly _registrations = new Map<string, LifecycleRegistration>();
  private readonly _graph = new DependencyGraph();
  private _frozen = false;

  /** Registers a component with optional configuration. */
  public register(
    component: LifecycleComponent,
    options: LifecycleRegistrationOptions = {},
  ): void {
    if (this._frozen) {
      throw new LifecycleError(
        "Cannot register components after registry is frozen",
        { code: ErrorCode.LIFECYCLE_COMPONENT },
      );
    }

    const id = options.id ?? component.name;

    if (options.timeout !== undefined) {
      assertTimeoutBudget(`Component "${id}" timeout`, options.timeout);
    }

    if (this._registrations.has(id)) {
      throw new LifecycleError(`Component "${id}" is already registered`, {
        code: ErrorCode.LIFECYCLE_COMPONENT,
        componentId: id,
      });
    }

    const registration: LifecycleRegistration = {
      id,
      component,
      dependsOn: options.dependsOn ?? [],
      priority: options.priority ?? 0,
      critical: options.critical ?? true,
      timeout: options.timeout ?? LIFECYCLE_DEFAULT_TIMEOUT,
      retry: {
        attempts: options.retry?.attempts ?? 0,
        delay: options.retry?.delay ?? 500,
        maxDelay: options.retry?.maxDelay ?? 10_000,
        backoff: options.retry?.backoff ?? "exponential",
      },
    };

    this._registrations.set(id, registration);
    this._graph.addNode(id);

    // Dependencies are NOT declared here: the graph tracks them as
    // undeclared until the dependency itself registers, so a typo in
    // `dependsOn` is caught by the graph as well as by validate().
    for (const dep of registration.dependsOn) {
      this._graph.addEdge(id, dep);
    }
  }

  /** Validates all registrations and dependency graph. */
  public validate(): void {
    for (const [id, reg] of this._registrations) {
      for (const dep of reg.dependsOn) {
        if (!this._registrations.has(dep)) {
          throw new LifecycleError(
            `Component "${id}" depends on "${dep}" which is not registered`,
            {
              code: ErrorCode.LIFECYCLE_DEPENDENCY,
              componentId: id,
              metadata: { dependency: dep },
            },
          );
        }
      }
    }
    this._graph.validate();
  }

  /** Freezes the registry — no more registrations allowed. */
  public freeze(): void {
    this.validate();
    this._frozen = true;
  }

  /** Returns whether the registry is frozen. */
  public get isFrozen(): boolean {
    return this._frozen;
  }

  /** Returns a registration by ID. */
  public get(id: string): LifecycleRegistration | undefined {
    return this._registrations.get(id);
  }

  /** Returns all registrations. */
  public getAll(): readonly LifecycleRegistration[] {
    return [...this._registrations.values()];
  }

  /** Returns all registration IDs. */
  public getIds(): readonly string[] {
    return [...this._registrations.keys()];
  }

  /** Returns the dependency graph. */
  public get graph(): DependencyGraph {
    return this._graph;
  }

  /** Returns the number of registered components. */
  public get size(): number {
    return this._registrations.size;
  }
}
