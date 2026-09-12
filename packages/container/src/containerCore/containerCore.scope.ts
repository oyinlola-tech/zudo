/**
 * ContainerScopeContext — a dependency scope with its own scoped-instance
 * cache and its own lifecycle for SCOPED instances.
 *
 * Ownership model:
 * - SCOPED instances created through this scope — including those created
 *   transitively as dependencies — are owned by the scope and disposed when
 *   the scope is disposed.
 * - SINGLETON instances resolved through a scope stay owned by the parent
 *   container — a scope's disposal never touches them.
 * - TRANSIENT instances are not tracked anywhere; callers own their disposal.
 *
 * Nesting: `scope.createScope()` creates a true child scope. A child sees
 * SCOPED instances already created by its ancestors (lookups chain upward),
 * while instances it creates itself are private to the child. Disposing a
 * scope disposes its children first, and a child refuses to resolve once any
 * ancestor (scope or container) is disposed.
 */

import type {
  RegistrationToken,
  ResolvedTokens,
} from "../containerRegistration/containerRegistration.core.js";

import {
  ContainerLifecycle,
  ContainerLifecycleOwner,
} from "../containerLifecycle/containerLifecycle.core.js";

import { ContainerScope } from "../containerScope/containerScope.type.js";

import type {
  ResolutionCache,
  ResolutionResult,
} from "../containerResolution/containerResolution.type.js";

import type { Token } from "../containerToken/containerToken.type.js";

import type {
  ContainerScopeOptions,
  ContainerLike,
} from "./containerCore.type.js";

export class ContainerScopeContext {
  private disposed = false;
  private disposing: Promise<void> | undefined;
  private readonly cache: ResolutionCache;
  private readonly lifecycle: ContainerLifecycle;
  private readonly container: ContainerLike;
  private readonly parentScope: ContainerScopeContext | undefined;
  private readonly children = new Set<ContainerScopeContext>();
  readonly name: string;
  readonly metadata: Readonly<Record<string, unknown>>;

  /**
   * @param container The container that owns the scope tree.
   * @param options Scope name / metadata.
   * @param parentScope When given, the new scope is a nested child of it.
   *   Application code should use `container.createScope()` /
   *   `scope.createScope()` rather than constructing scopes directly.
   */
  constructor(
    container: ContainerLike,
    options: ContainerScopeOptions = {},
    parentScope?: ContainerScopeContext,
  ) {
    this.container = container;
    this.parentScope = parentScope;
    this.name = options.name ?? `${(parentScope ?? container).name}:scope`;
    this.metadata = Object.freeze({ ...(options.metadata ?? {}) });
    this.cache = container.createScopeCache(parentScope?.cache);
    this.lifecycle = new ContainerLifecycle();
  }

  /**
   * Resolves a dependency within this scope.
   *
   * SCOPED instances are cached per scope (visible to child scopes) and
   * tracked for disposal with the scope that created them. SINGLETON
   * instances come from (and are tracked by) the container. TRANSIENT
   * instances are created fresh and never tracked.
   */
  resolve<T>(token: RegistrationToken<T>): T {
    this.ensureActive();
    const result = this.container.resolveInScope(token, this.cache, (created) =>
      this.trackCreated(created),
    );
    return result.value;
  }

  /**
   * Resolves multiple dependencies within this scope, typed per token.
   */
  resolveMany<const Tokens extends readonly RegistrationToken[]>(
    tokens: Tokens,
  ): ResolvedTokens<Tokens> {
    return tokens.map((token) => this.resolve(token)) as ResolvedTokens<Tokens>;
  }

  /**
   * Checks whether a dependency can be resolved.
   */
  canResolve<T>(token: RegistrationToken<T>): boolean {
    this.ensureActive();
    return this.container.canResolve(token);
  }

  /**
   * Checks whether a registration exists.
   */
  has<T>(token: RegistrationToken<T>): boolean {
    this.ensureActive();
    return this.container.has(token);
  }

  /**
   * Creates a nested child scope.
   *
   * The child inherits this scope's cached SCOPED instances for lookups,
   * caches the SCOPED instances it creates itself, and is disposed
   * automatically when this scope is disposed.
   */
  createScope(options: ContainerScopeOptions = {}): ContainerScopeContext {
    this.ensureActive();
    const child = new ContainerScopeContext(this.container, options, this);
    this.children.add(child);
    return child;
  }

  /**
   * Disposes child scopes (most recent first), then all SCOPED instances
   * belonging to this scope in reverse creation order, and detaches the scope
   * from its parent. Container-owned singletons are not touched. Idempotent.
   *
   * Every failure is collected; the scope is marked disposed regardless and
   * an AggregateError listing the failures is thrown afterwards. Concurrent
   * callers share the in-flight disposal rather than returning early.
   */
  dispose(): Promise<void> {
    if (this.disposing) return this.disposing;
    if (this.disposed) return Promise.resolve();
    this.disposed = true;
    this.disposing = this.runDispose().finally(() => {
      this.disposing = undefined;
    });
    return this.disposing;
  }

  private async runDispose(): Promise<void> {
    const failures: unknown[] = [];
    for (const child of [...this.children].reverse()) {
      try {
        await child.dispose();
      } catch (error) {
        failures.push(error);
      }
    }
    this.children.clear();
    try {
      await this.lifecycle.dispose();
    } catch (error) {
      failures.push(error);
    } finally {
      this.lifecycle.shutdown();
      this.cache.clear();
      if (this.parentScope) this.parentScope.releaseChild(this);
      else this.container.releaseScope(this);
    }
    if (failures.length > 0)
      throw new AggregateError(
        failures,
        `Container scope "${this.name}" was disposed, but ${failures.length} cleanup step(s) failed.`,
      );
  }

  /**
   * Returns whether the scope has been disposed.
   */
  isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * Returns the direct parent: the container for a top-level scope, or the
   * parent scope for a nested one.
   */
  getParent(): ContainerLike | ContainerScopeContext {
    return this.parentScope ?? this.container;
  }

  /**
   * Returns the container that owns the whole scope tree.
   */
  getContainer(): ContainerLike {
    return this.container;
  }

  /** @internal Detaches a disposed child scope. */
  releaseChild(scope: ContainerScopeContext): void {
    this.children.delete(scope);
  }

  /**
   * Tracks SCOPED instances created during a resolution through this scope
   * (top-level result or transitively created dependency). Instances served
   * from an ancestor's cache are cache hits and never reach here.
   */
  private trackCreated(result: ResolutionResult<unknown>): void {
    if (result.scope !== ContainerScope.SCOPED) return;
    this.lifecycle.track(
      result.token as Token,
      result.value,
      ContainerLifecycleOwner.SCOPE,
    );
  }

  /**
   * Throws when the scope — or any ancestor scope, or the container that
   * owns it — is no longer active.
   */
  private ensureActive(): void {
    if (this.disposed) {
      throw new Error(
        `Container scope "${this.name}" has already been disposed.`,
      );
    }
    if (this.parentScope?.isDisposed()) {
      throw new Error(
        `Parent scope "${this.parentScope.name}" of scope "${this.name}" has been disposed.`,
      );
    }
    if (this.container.isDisposed()) {
      throw new Error(
        `Container "${this.container.name}" owning scope "${this.name}" has been disposed.`,
      );
    }
  }
}
