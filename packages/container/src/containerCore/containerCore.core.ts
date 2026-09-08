/**
 * Core dependency injection container for Zudojs.
 *
 * Lifetime and disposal model:
 * - SINGLETON instances are cached in the container's root singleton cache
 *   and tracked by the container lifecycle — including singletons created
 *   transitively as dependencies of another resolution; they are disposed
 *   when the container is disposed (or when their registration is
 *   replaced/removed).
 * - SCOPED instances only exist inside a scope created with `createScope()`;
 *   resolving a SCOPED token at the root throws.
 * - TRANSIENT instances are never cached and never tracked — callers own
 *   their disposal.
 */

import type {
  ContainerProvider,
  ProviderToken,
} from "../containerProvider/containerProvider.core.js";
import {
  existingProvider,
  factoryProvider,
  valueProvider,
  classProvider,
} from "../containerProvider/containerProvider.core.js";
import { ContainerScope as Scope } from "../containerScope/containerScope.type.js";
import type {
  ContainerRegistration,
  CreateRegistrationOptions,
  RegistrationToken,
  ResolvedTokens,
} from "../containerRegistration/containerRegistration.core.js";
import { ContainerRegistry } from "../containerRegistry/containerRegistry.core.js";
import { ContainerResolver } from "../containerResolution/containerResolution.core.js";
import type {
  ResolutionCache,
  ResolutionOptions,
  ResolutionResult,
} from "../containerResolution/containerResolution.type.js";
import {
  ContainerLifecycle,
  ContainerLifecycleOwner,
} from "../containerLifecycle/containerLifecycle.core.js";
import type {
  ContainerOptions,
  ResolvedContainerOptions,
} from "../containerOptions/containerOptions.type.js";
import { resolveContainerOptions } from "../containerOptions/containerOptions.type.js";
import type {
  Constructor,
  Token,
} from "../containerToken/containerToken.type.js";
import { unwrapToken } from "../containerToken/containerToken.type.js";
import { RegistrationNotFoundError } from "@zudojs/errors";
import type {
  ContainerLike,
  ContainerScopeOptions,
} from "./containerCore.type.js";
import { ContainerScopeContext } from "./containerCore.scope.js";

/** Options accepted by {@link Container.registerClass}. */
export interface RegisterClassOptions extends CreateRegistrationOptions {
  /**
   * Tokens resolved and passed to the constructor, in order.
   * Omit for zero-argument constructors.
   */
  readonly inject?: readonly ProviderToken[];
}

export class Container implements ContainerLike {
  readonly name: string;
  readonly options: ResolvedContainerOptions;
  readonly #registry: ContainerRegistry;
  readonly #resolver: ContainerResolver;
  readonly #lifecycle: ContainerLifecycle;
  readonly #liveScopes = new Set<ContainerScopeContext>();
  #started = false;
  #disposed = false;

  constructor(options: ContainerOptions = {}) {
    this.options = resolveContainerOptions(options);
    this.name = this.options.name;
    this.#registry = new ContainerRegistry(this.options.registry);
    this.#lifecycle = new ContainerLifecycle(this.options.lifecycle);
    this.#resolver = new ContainerResolver(this.#registry, (token) => {
      // A cached singleton was evicted because its registration changed;
      // dispose the tracked instance. Eviction disposal is best-effort:
      // failures cannot propagate through the synchronous registry mutation
      // that triggered them.
      void this.#lifecycle.disposeInstance(token).catch(() => {
        /* see clearSingletons()/dispose() for error-surfacing disposal */
      });
    });
  }

  /**
   * Marks the container as started.
   *
   * Calling `start()` explicitly is optional: `resolve()` (and
   * `createScope()`) auto-start the container on first use. Note that with
   * `freezeRegistrations: true`, starting — including the implicit start
   * performed by the first `resolve()` — freezes the registration set.
   */
  start(): this {
    this.ensureNotDisposed();
    if (this.#started) return this;
    this.#started = true;
    return this;
  }

  register<T>(
    token: RegistrationToken<T>,
    provider: ContainerProvider<T>,
    options: CreateRegistrationOptions = {},
  ): ContainerRegistration<T> {
    this.ensureMutable();
    return this.#registry.register(token, provider, options);
  }

  registerClass<T>(
    token: RegistrationToken<T>,
    ctor: Constructor<T>,
    options: RegisterClassOptions = {},
  ): ContainerRegistration<T> {
    const { inject, ...rest } = options;
    return this.register(token, classProvider(ctor, inject ?? []), rest);
  }

  /**
   * Registers a pre-built value.
   *
   * Note: the scope is forcibly set to SINGLETON (overriding any
   * `options.scope`) — a value provider always returns the same instance, so
   * any other lifetime would be misleading.
   */
  registerValue<T>(
    token: RegistrationToken<T>,
    value: T,
    options: CreateRegistrationOptions = {},
  ): ContainerRegistration<T> {
    return this.register(token, valueProvider(value), {
      ...options,
      scope: Scope.SINGLETON,
    });
  }

  registerFactory<T>(
    token: RegistrationToken<T>,
    factory: (...deps: unknown[]) => T,
    inject: readonly ProviderToken[] = [],
    options: CreateRegistrationOptions = {},
  ): ContainerRegistration<T> {
    return this.register(token, factoryProvider(factory, inject), options);
  }

  registerExisting<T>(
    token: RegistrationToken<T>,
    existing: ProviderToken<T>,
    options: CreateRegistrationOptions = {},
  ): ContainerRegistration<T> {
    return this.register(token, existingProvider(existing), options);
  }

  /**
   * Resolves a dependency at the container root.
   *
   * Auto-starts the container on first use. SCOPED registrations cannot be
   * resolved here — create a scope with {@link createScope} instead.
   */
  resolve<T>(token: RegistrationToken<T>): T {
    this.ensureActive();
    return this.#resolver.resolveDetailed(token, this.buildResolutionOptions())
      .value;
  }

  /**
   * Resolves several tokens at once. The result is a tuple typed per token,
   * so heterogeneous token lists keep their individual types.
   */
  resolveMany<const Tokens extends readonly RegistrationToken[]>(
    tokens: Tokens,
  ): ResolvedTokens<Tokens> {
    return tokens.map((t) => this.resolve(t)) as ResolvedTokens<Tokens>;
  }

  /**
   * Like {@link resolve} but returns `undefined` when the token has no
   * registration (and cannot be auto-registered). Other resolution failures
   * — broken factories, missing dependencies, captive dependencies — still
   * throw.
   */
  resolveOptional<T>(token: RegistrationToken<T>): T | undefined {
    try {
      return this.resolve(token);
    } catch (error) {
      if (error instanceof RegistrationNotFoundError) return undefined;
      throw error;
    }
  }

  canResolve<T>(token: RegistrationToken<T>): boolean {
    this.ensureNotDisposed();
    return this.#resolver.canResolve(
      token,
      this.resolutionOptions.autoRegisterClasses,
    );
  }

  has<T>(token: RegistrationToken<T>): boolean {
    this.ensureNotDisposed();
    return this.#registry.has(token);
  }

  getRegistration<T>(
    token: RegistrationToken<T>,
  ): ContainerRegistration<T> | undefined {
    this.ensureNotDisposed();
    return this.#registry.get(token);
  }

  replace<T>(
    token: RegistrationToken<T>,
    provider: ContainerProvider<T>,
    options: CreateRegistrationOptions = {},
  ): ContainerRegistration<T> {
    this.ensureMutable();
    return this.#registry.replace(token, provider, options);
  }

  remove<T>(token: RegistrationToken<T>): boolean {
    this.ensureMutable();
    return this.#registry.remove(token);
  }

  /** Removes every registration (evicting and disposing cached singletons). */
  clearRegistrations(): void {
    this.ensureMutable();
    this.#registry.clear();
  }

  createScope(options: ContainerScopeOptions = {}): ContainerScopeContext {
    this.ensureActive();
    if (!this.options.allowScopes)
      throw new Error(`Container scopes are disabled for "${this.name}".`);
    const scope = new ContainerScopeContext(this, options);
    this.#liveScopes.add(scope);
    return scope;
  }

  getRegistrations(): readonly ContainerRegistration[] {
    this.ensureNotDisposed();
    return this.#registry.getAll();
  }

  getTokens(): readonly Token<unknown>[] {
    this.ensureNotDisposed();
    return this.#registry.getTokens();
  }

  get registrationCount(): number {
    return this.#registry.size;
  }

  /**
   * Returns an immutable snapshot of the current registrations, suitable for
   * later {@link restoreSnapshot}. Cached instances are NOT part of the
   * snapshot — only the registrations.
   */
  snapshot(): readonly ContainerRegistration[] {
    this.ensureNotDisposed();
    return this.#registry.snapshot();
  }

  /**
   * Wholesale-replaces the registration set with a previous snapshot.
   * Entries are validated, cached singletons for the old set are evicted and
   * disposed, and the operation is refused when registrations are frozen.
   */
  restoreSnapshot(registrations: readonly ContainerRegistration[]): void {
    this.ensureMutable();
    this.#registry.restore(registrations);
  }

  isStarted(): boolean {
    return this.#started;
  }
  isDisposed(): boolean {
    return this.#disposed;
  }

  /**
   * Evicts all cached singleton instances and disposes the tracked ones.
   * Fails with an AggregateError listing every disposal failure.
   */
  async clearSingletons(): Promise<void> {
    this.ensureNotDisposed();
    const tokens = this.#resolver.getCachedSingletonTokens();
    this.#resolver.clearSingletonCache();
    const failures: unknown[] = [];
    for (const token of tokens) {
      try {
        await this.#lifecycle.disposeInstance(token);
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length > 0)
      throw new AggregateError(
        failures,
        `Failed to dispose ${failures.length} singleton instance(s) of container "${this.name}".`,
      );
  }

  /**
   * Disposes the container: all live scopes first, then (with
   * `autoDispose: true`, the default) every tracked singleton in reverse
   * creation order.
   *
   * With `autoDispose: false` tracked instances are NOT disposed — their
   * references are simply released and disposal becomes the caller's
   * responsibility.
   *
   * Disposal is terminal: the container is marked disposed even when some
   * instances fail to dispose; every failure is reported in the thrown
   * AggregateError. Idempotent.
   */
  async dispose(): Promise<void> {
    if (this.#disposed) return;
    const failures: unknown[] = [];
    for (const scope of [...this.#liveScopes]) {
      try {
        await scope.dispose();
      } catch (error) {
        failures.push(error);
      }
    }
    this.#liveScopes.clear();
    if (this.options.autoDispose) {
      try {
        await this.#lifecycle.dispose();
      } catch (error) {
        failures.push(error);
      }
    }
    this.#lifecycle.shutdown();
    this.#resolver.clearSingletonCache();
    this.#disposed = true;
    this.#started = false;
    if (failures.length > 0)
      throw new AggregateError(
        failures,
        `Container "${this.name}" was disposed, but ${failures.length} cleanup step(s) failed.`,
      );
  }

  get resolutionOptions(): {
    autoRegisterClasses: boolean;
    detectCircularDependencies: boolean;
    maxResolutionDepth: number;
  } {
    return {
      autoRegisterClasses: this.options.resolution.autoRegisterClasses ?? true,
      detectCircularDependencies:
        this.options.resolution.detectCircularDependencies ?? true,
      maxResolutionDepth: this.options.resolution.maxResolutionDepth ?? 100,
    };
  }

  /** @internal Creates a fresh scoped-instance cache for a scope. */
  createScopeCache(parent?: ResolutionCache): ResolutionCache {
    return this.#resolver.createScope(parent);
  }

  /** @internal Resolves on behalf of a scope, tracking singleton results. */
  resolveInScope<T>(
    token: RegistrationToken<T>,
    cache: ResolutionCache,
    onInstanceCreated?: (result: ResolutionResult<unknown>) => void,
  ): ResolutionResult<T> {
    this.ensureActive();
    return this.#resolver.resolveDetailed(
      token,
      this.buildResolutionOptions(cache, onInstanceCreated),
    );
  }

  /** @internal Unregisters a top-level scope from the live-scope set. */
  releaseScope(scope: ContainerScopeContext): void {
    this.#liveScopes.delete(scope);
  }

  private buildResolutionOptions(
    cache?: ResolutionCache,
    onInstanceCreated?: (result: ResolutionResult<unknown>) => void,
  ): ResolutionOptions {
    return {
      ...this.resolutionOptions,
      allowRegistration: !this.options.freezeRegistrations,
      cache,
      onInstanceCreated: (result) => {
        this.trackCreated(result);
        onInstanceCreated?.(result);
      },
    };
  }

  /**
   * Tracks every freshly created SINGLETON instance — top-level results and
   * transitively created dependencies alike — in the container lifecycle.
   * SCOPED instances are owned by scopes and TRANSIENT ones by callers.
   */
  private trackCreated(result: ResolutionResult<unknown>): void {
    if (result.scope !== Scope.SINGLETON) return;
    this.#lifecycle.track(
      unwrapToken(result.token),
      result.value,
      ContainerLifecycleOwner.CONTAINER,
    );
  }

  private ensureActive(): void {
    this.ensureNotDisposed();
    if (!this.#started) this.start();
  }
  private ensureNotDisposed(): void {
    if (this.#disposed)
      throw new Error(`Container "${this.name}" has already been disposed.`);
  }
  private ensureMutable(): void {
    this.ensureNotDisposed();
    if (!this.options.freezeRegistrations) return;
    if (this.#started)
      throw new Error(`Registrations for container "${this.name}" are frozen.`);
  }
}

export function createContainer(options: ContainerOptions = {}): Container {
  return new Container(options);
}
export function createStartedContainer(
  options: ContainerOptions = {},
): Container {
  return new Container(options).start();
}
