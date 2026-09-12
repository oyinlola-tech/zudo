/**
 * Dependency resolver for Zudojs.
 *
 * Lifetime semantics:
 * - SINGLETON instances are always looked up in and stored to the resolver's
 *   root singleton cache, no matter where the resolution happens (root or
 *   scope). A scope can therefore never re-create or shadow a singleton.
 * - SCOPED instances live in the scope cache supplied via
 *   `ResolutionOptions.cache`. Resolving a SCOPED registration without a
 *   scope cache throws a ScopedResolutionError; a SCOPED dependency of a
 *   SINGLETON throws a CaptiveDependencyError.
 * - TRANSIENT instances are never cached.
 *
 * Every freshly created instance (any lifetime, never a cache hit) is
 * reported through `ResolutionOptions.onInstanceCreated` in creation order,
 * so owners can track transitively created dependencies for disposal — not
 * just the top-level result of a `resolve()` call.
 *
 * Factories registered as SINGLETON or SCOPED must be synchronous: a Promise
 * result throws an AsyncProviderError instead of being cached as the instance.
 *
 * The resolver subscribes to registry change events: REPLACE/REMOVE evict the
 * affected token's cached singleton, CLEAR/RESTORE evict all cached
 * singletons. Each eviction is reported through the `onSingletonEvicted`
 * callback so the owning container can dispose the instance.
 */

import {
  isClassProvider,
  isExistingProvider,
  isFactoryProvider,
  isValueProvider,
  normalizeProvider,
} from "../containerProvider/containerProvider.core.js";

import { ContainerScope as Scope } from "../containerScope/containerScope.type.js";

import type {
  ContainerRegistration,
  RegistrationToken,
} from "../containerRegistration/containerRegistration.core.js";

import {
  defineRegistration,
  getRegistrationToken,
} from "../containerRegistration/containerRegistration.core.js";

import type { ContainerRegistry } from "../containerRegistry/containerRegistry.core.js";
import type { RegistryChangeEvent } from "../containerRegistry/containerRegistry.type.js";
import { RegistryOperation } from "../containerRegistry/containerRegistry.type.js";

import { unwrapToken } from "../containerToken/containerToken.type.js";

import type { Token } from "../containerToken/containerToken.type.js";

import type {
  ResolutionCache,
  ResolutionOptions,
  ResolutionResult,
} from "./containerResolution.type.js";

import {
  CircularDependencyError,
  ProviderResolutionError,
  RegistrationNotFoundError,
} from "@zudojs/errors";
import {
  AsyncProviderError,
  CaptiveDependencyError,
  DependencyResolutionError,
  MaxResolutionDepthError,
  ScopedResolutionError,
} from "./containerResolution.error.js";
import { describeToken } from "../containerToken/containerToken.type.js";

/** Normalized per-resolution settings. */
interface ResolutionState {
  readonly scopeCache: ResolutionCache | undefined;
  readonly autoRegisterClasses: boolean;
  readonly allowRegistration: boolean;
  readonly detectCircularDependencies: boolean;
  readonly maxResolutionDepth: number;
  readonly onInstanceCreated:
    ((result: ResolutionResult<unknown>) => void) | undefined;
  /** Mutable resolution path (also mirrored in pathSet for O(1) cycle checks). */
  readonly path: Token<unknown>[];
  readonly pathSet: Set<Token<unknown>>;
}

/**
 * Scope cache that falls back to its parent scope's cache for lookups while
 * writing only to its own map. Nested scopes therefore see SCOPED instances
 * already created by their ancestors, while instances they create themselves
 * stay private to (and are disposed with) the nested scope.
 */
class ChainedResolutionCache implements ResolutionCache {
  readonly #own = new Map<Token<unknown>, unknown>();
  readonly #parent: ResolutionCache | undefined;

  constructor(parent?: ResolutionCache) {
    this.#parent = parent;
  }

  has(token: Token<unknown>): boolean {
    return this.#own.has(token) || (this.#parent?.has(token) ?? false);
  }

  get(token: Token<unknown>): unknown {
    if (this.#own.has(token)) return this.#own.get(token);
    return this.#parent?.get(token);
  }

  set(token: Token<unknown>, value: unknown): void {
    this.#own.set(token, value);
  }

  clear(): void {
    this.#own.clear();
  }
}

export class ContainerResolver {
  private readonly registry: ContainerRegistry;
  private readonly singletonCache = new Map<Token<unknown>, unknown>();
  private readonly onSingletonEvicted:
    ((token: Token<unknown>) => void) | undefined;

  constructor(
    registry: ContainerRegistry,
    onSingletonEvicted?: (token: Token<unknown>) => void,
  ) {
    this.registry = registry;
    this.onSingletonEvicted = onSingletonEvicted;
    registry.subscribe((event) => this.handleRegistryChange(event));
  }

  resolve<T>(token: RegistrationToken<T>, options: ResolutionOptions = {}): T {
    return this.resolveDetailed(token, options).value;
  }

  resolveDetailed<T>(
    token: RegistrationToken<T>,
    options: ResolutionOptions = {},
  ): ResolutionResult<T> {
    const normalized = unwrapToken(token);
    const path = [...(options.path ?? [])];
    const state: ResolutionState = {
      scopeCache: options.cache,
      autoRegisterClasses: options.autoRegisterClasses ?? true,
      allowRegistration: options.allowRegistration ?? true,
      detectCircularDependencies: options.detectCircularDependencies ?? true,
      maxResolutionDepth: options.maxResolutionDepth ?? 100,
      onInstanceCreated: options.onInstanceCreated,
      path,
      pathSet: new Set(path),
    };
    return this.resolveInternal(normalized, state, undefined);
  }

  private resolveInternal<T>(
    token: Token<T>,
    state: ResolutionState,
    singletonAncestor: Token<unknown> | undefined,
  ): ResolutionResult<T> {
    const depth = state.path.length + 1;
    if (depth > state.maxResolutionDepth)
      throw new MaxResolutionDepthError(
        describeToken(token),
        depth,
        state.maxResolutionDepth,
        [...state.path, token].map((t) => describeToken(t)),
      );

    if (state.detectCircularDependencies && state.pathSet.has(token))
      throw new CircularDependencyError(
        [...state.path, token].map((t) => describeToken(t)),
      );

    let registration = this.registry.get(token);
    if (!registration) {
      if (state.autoRegisterClasses && typeof token === "function") {
        if (state.allowRegistration) {
          registration = this.registry.register(
            token,
            { useClass: token },
            { scope: Scope.TRANSIENT },
          );
        } else {
          // Registrations are frozen: instantiate ephemerally, do not register.
          registration = defineRegistration(
            token,
            { useClass: token },
            { scope: Scope.TRANSIENT },
          );
        }
      } else {
        throw new RegistrationNotFoundError(describeToken(token));
      }
    }

    const currentPath = [...state.path, token];

    if (registration.scope === Scope.SINGLETON) {
      if (this.singletonCache.has(token)) {
        return {
          value: this.singletonCache.get(token) as T,
          token,
          registration,
          scope: registration.scope,
          fromCache: true,
          path: currentPath,
        };
      }
    } else if (registration.scope === Scope.SCOPED) {
      if (singletonAncestor !== undefined)
        throw new CaptiveDependencyError(
          describeToken(singletonAncestor),
          describeToken(token),
          currentPath.map((t) => describeToken(t)),
        );
      if (!state.scopeCache)
        throw new ScopedResolutionError(
          describeToken(token),
          currentPath.map((t) => describeToken(t)),
        );
      if (state.scopeCache.has(token)) {
        return {
          value: state.scopeCache.get(token) as T,
          token,
          registration,
          scope: registration.scope,
          fromCache: true,
          path: currentPath,
        };
      }
    }

    const nextAncestor =
      registration.scope === Scope.SINGLETON ? token : singletonAncestor;
    state.path.push(token);
    state.pathSet.add(token);
    let value: T;
    let owned: boolean;
    try {
      ({ value, owned } = this.createInstance(
        registration,
        state,
        nextAncestor,
      ));
    } finally {
      state.path.pop();
      state.pathSet.delete(token);
    }

    if (registration.scope === Scope.SINGLETON)
      this.singletonCache.set(token, value);
    else if (registration.scope === Scope.SCOPED)
      state.scopeCache?.set(token, value);

    const result: ResolutionResult<T> = {
      value,
      token,
      registration,
      scope: registration.scope,
      fromCache: false,
      path: currentPath,
    };
    // A `useExisting` alias of a cached (SINGLETON/SCOPED) target does not
    // own the instance it hands out — the target's own creation already
    // reported it. Reporting it again registered a second owner for the same
    // object: the container disposed it twice, and a SCOPED alias let a
    // scope dispose a container-owned singleton.
    if (owned) state.onInstanceCreated?.(result);
    return result;
  }

  private createInstance<T>(
    registration: ContainerRegistration<T>,
    state: ResolutionState,
    singletonAncestor: Token<unknown> | undefined,
  ): { value: T; owned: boolean } {
    const provider = normalizeProvider(registration.provider);
    const token = getRegistrationToken(registration);
    try {
      if (isValueProvider(provider))
        return { value: provider.useValue, owned: true };
      if (isExistingProvider(provider)) {
        const target = unwrapToken(provider.useExisting);
        if (
          !this.registry.has(target) &&
          !(state.autoRegisterClasses && typeof target === "function")
        ) {
          throw new Error(
            `useExisting target "${describeToken(target)}" for token ` +
              `"${describeToken(token)}" is not registered.`,
          );
        }
        const resolved = this.resolveInternal(
          target,
          state,
          singletonAncestor,
        );
        // Only a TRANSIENT target has no owner of its own; a cached alias
        // of it is the one place the instance can be tracked.
        return {
          value: resolved.value as T,
          owned: resolved.scope === Scope.TRANSIENT,
        };
      }
      if (isFactoryProvider(provider)) {
        const deps = provider.inject ?? [];
        const args = deps.map(
          (d) =>
            this.resolveInternal(unwrapToken(d), state, singletonAncestor)
              .value,
        );
        const produced = provider.useFactory(...args);
        if (registration.scope !== Scope.TRANSIENT && isPromiseLike(produced))
          throw new AsyncProviderError(
            describeToken(token),
            registration.scope,
          );
        return { value: produced, owned: true };
      }
      if (isClassProvider(provider)) {
        const deps = provider.inject ?? [];
        const args = deps.map(
          (d) =>
            this.resolveInternal(unwrapToken(d), state, singletonAncestor)
              .value,
        );
        const ctor = provider.useClass as new (...ctorArgs: unknown[]) => T;
        return { value: new ctor(...args), owned: true };
      }
      throw new Error("Unsupported container provider.");
    } catch (error) {
      // Resolution errors created deeper in the chain already carry the full
      // chain in their message/details — propagate them unchanged.
      if (
        error instanceof CircularDependencyError ||
        error instanceof ProviderResolutionError ||
        error instanceof ScopedResolutionError ||
        error instanceof CaptiveDependencyError ||
        error instanceof MaxResolutionDepthError ||
        error instanceof AsyncProviderError
      )
        throw error;
      throw new DependencyResolutionError(
        describeToken(token),
        error,
        state.path.map((t) => describeToken(t)),
      );
    }
  }

  /**
   * Creates an empty scope cache for SCOPED instances. When `parent` is
   * given, lookups fall back to it (nested scope semantics) while writes stay
   * local to the new cache.
   */
  createScope(parent?: ResolutionCache): ResolutionCache {
    return new ChainedResolutionCache(parent);
  }

  /** Tokens currently held in the singleton cache. */
  getCachedSingletonTokens(): readonly Token<unknown>[] {
    return [...this.singletonCache.keys()];
  }

  /**
   * Clears the singleton cache WITHOUT invoking eviction callbacks.
   * Callers are responsible for disposing the previously cached instances.
   */
  clearSingletonCache(): void {
    this.singletonCache.clear();
  }

  resolveMany<T>(
    tokens: readonly RegistrationToken<T>[],
    options: ResolutionOptions = {},
  ): T[] {
    return tokens.map((t) => this.resolve(t, options));
  }

  canResolve<T>(
    token: RegistrationToken<T>,
    autoRegisterClasses = true,
  ): boolean {
    const t = unwrapToken(token);
    return (
      this.registry.has(t) || (autoRegisterClasses && typeof t === "function")
    );
  }

  private handleRegistryChange(event: RegistryChangeEvent): void {
    switch (event.operation) {
      case RegistryOperation.REPLACE:
      case RegistryOperation.REMOVE: {
        const token = unwrapToken(event.token);
        this.evictSingleton(token);
        this.evictAliasesOf(token);
        break;
      }
      case RegistryOperation.CLEAR:
      case RegistryOperation.RESTORE: {
        for (const t of [...this.singletonCache.keys()]) this.evictSingleton(t);
        break;
      }
      default:
        break;
    }
  }

  private evictSingleton(token: Token<unknown>): void {
    if (!this.singletonCache.has(token)) return;
    this.singletonCache.delete(token);
    this.onSingletonEvicted?.(token);
  }

  /**
   * Evicts every cached singleton whose `useExisting` chain ends at `target`.
   *
   * A cached alias holds the target's instance under its own token, so
   * evicting the target alone left the alias serving the old — by now
   * disposed — instance after `replace()`/`remove()`.
   */
  private evictAliasesOf(target: Token<unknown>): void {
    for (const cached of [...this.singletonCache.keys()]) {
      if (cached === target) continue;
      if (this.aliasChainReaches(cached, target)) this.evictSingleton(cached);
    }
  }

  private aliasChainReaches(
    token: Token<unknown>,
    target: Token<unknown>,
  ): boolean {
    const visited = new Set<Token<unknown>>();
    let current: Token<unknown> = token;
    for (;;) {
      const registration = this.registry.get(current);
      if (!registration) return false;
      const provider = normalizeProvider(registration.provider);
      if (!isExistingProvider(provider)) return false;
      const next = unwrapToken(provider.useExisting);
      if (next === target) return true;
      if (visited.has(next)) return false;
      visited.add(next);
      current = next;
    }
  }
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof (value as { then?: unknown }).then === "function"
  );
}
