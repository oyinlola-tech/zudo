import type { Provider } from "./provider.js";
import type { Scope } from "./scope.js";
import type { Token } from "./token.js";
import {
  ProviderNotFoundError,
  ProviderAlreadyRegisteredError,
  InvalidProviderError,
  DependencyResolutionError,
} from "../errors/exceptions.js";

/**
 * Internal representation of a registered dependency.
 */
interface ProviderRegistration {
  readonly provider: Provider<unknown>;
  readonly scope: Scope;
  /** Whether a singleton instance has been created (even if undefined). */
  resolved: boolean;
  instance?: unknown;
  /**
   * Per-scope instances of a "scoped" provider. Owned by the
   * registration so that unregister()/clear() drop them together
   * with the provider instead of leaving stale instances behind
   * for a token that is registered again later.
   */
  readonly scopedInstances: WeakMap<object, unknown>;
}

/**
 * Options for the container.
 */
export interface ContainerOptions {
  /**
   * Returns the object identifying the current execution scope, for
   * example the current ExecutionContext from a ContextStorage:
   *
   *   new Container({ currentScope: () => storage.get() })
   *
   * "scoped" providers resolve to one instance per returned object.
   * When it returns undefined and no explicit scope is active, scoped
   * providers behave as transient.
   */
  readonly currentScope?: () => object | undefined;
}

/**
 * Dependency Injection container for Zudojs applications.
 *
 * The container is responsible for registering and resolving
 * application dependencies with singleton, scoped, and transient
 * lifetimes.
 */
export class Container {
  private readonly providers = new Map<Token<unknown>, ProviderRegistration>();
  private readonly currentScope: (() => object | undefined) | undefined;
  private readonly resolving: Token<unknown>[] = [];
  private activeScope: object | undefined;

  public constructor(options: ContainerOptions = {}) {
    this.currentScope = options.currentScope;
  }

  /**
   * Registers a provider in the container.
   */
  public register<T>(
    token: Token<T>,
    provider: Provider<T>,
    scope: Scope = "singleton",
  ): void {
    if (this.providers.has(token)) {
      throw new ProviderAlreadyRegisteredError(token);
    }

    if (!isProvider(provider)) {
      throw new InvalidProviderError(token);
    }

    this.providers.set(token, {
      provider: provider as Provider<unknown>,
      scope,
      resolved: false,
      scopedInstances: new WeakMap(),
    });
  }

  /**
   * Resolves a dependency from the container.
   *
   * Scoped providers use the explicit scope active during resolution
   * (see {@link createScope}) or the `currentScope` callback.
   */
  public resolve<T>(token: Token<T>): T {
    return this.resolveIn(token, this.activeScope ?? this.currentScope?.());
  }

  /**
   * Creates an explicit resolution scope. Scoped providers resolved
   * through the returned scope share one instance per scope.
   */
  public createScope(): ContainerScope {
    return new ContainerScope(this, {});
  }

  /**
   * Checks whether a token has been registered.
   */
  public has<T>(token: Token<T>): boolean {
    return this.providers.has(token);
  }

  /**
   * Removes a provider from the container.
   *
   * Primarily useful for testing and controlled runtime scenarios.
   */
  public unregister<T>(token: Token<T>): boolean {
    return this.providers.delete(token);
  }

  /**
   * Clears all registered providers.
   */
  public clear(): void {
    this.providers.clear();
  }

  /**
   * Resolves a token within a specific scope key.
   *
   * @internal Used by ContainerScope.
   */
  public resolveIn<T>(token: Token<T>, scopeKey: object | undefined): T {
    const registration = this.providers.get(token);

    if (!registration) {
      throw new ProviderNotFoundError(token);
    }

    if (registration.scope === "singleton" && registration.resolved) {
      return registration.instance as T;
    }

    if (registration.scope === "scoped" && scopeKey) {
      if (registration.scopedInstances.has(scopeKey)) {
        return registration.scopedInstances.get(scopeKey) as T;
      }
    }

    const instance = this.createInstance<T>(token, registration, scopeKey);

    if (registration.scope === "singleton") {
      registration.instance = instance;
      registration.resolved = true;
    } else if (registration.scope === "scoped" && scopeKey) {
      registration.scopedInstances.set(scopeKey, instance);
    }

    return instance;
  }

  /**
   * Creates an instance from a provider definition, tracking the
   * resolution chain so cycles fail fast with a diagnostic instead of
   * a stack overflow.
   */
  private createInstance<T>(
    token: Token<T>,
    registration: ProviderRegistration,
    scopeKey: object | undefined,
  ): T {
    if (this.resolving.includes(token)) {
      throw new DependencyResolutionError(
        "Circular dependency detected while resolving.",
        [...this.resolving, token],
      );
    }

    const provider = registration.provider as Provider<T>;

    if ("useValue" in provider) {
      return provider.useValue;
    }

    const previousScope = this.activeScope;
    this.resolving.push(token);
    this.activeScope = scopeKey;

    try {
      if ("useFactory" in provider) {
        return provider.useFactory(this);
      }

      return new provider.useClass();
    } catch (error) {
      if (error instanceof DependencyResolutionError) throw error;

      throw new DependencyResolutionError(
        `Failed to resolve dependency.`,
        [...this.resolving],
        error,
      );
    } finally {
      this.resolving.pop();
      this.activeScope = previousScope;
    }
  }
}

/**
 * An explicit resolution scope created by {@link Container.createScope}.
 *
 * Scoped providers resolved through this object are cached for its
 * lifetime; singleton and transient providers behave as usual.
 */
export class ContainerScope {
  private readonly container: Container;
  private readonly key: object;

  public constructor(container: Container, key: object) {
    this.container = container;
    this.key = key;
  }

  public resolve<T>(token: Token<T>): T {
    return this.container.resolveIn(token, this.key);
  }

  public has<T>(token: Token<T>): boolean {
    return this.container.has(token);
  }
}

function isProvider(value: unknown): value is Provider<unknown> {
  if (typeof value !== "object" || value === null) return false;

  if ("useValue" in value) return true;
  if ("useFactory" in value)
    return typeof (value as { useFactory: unknown }).useFactory === "function";
  if ("useClass" in value)
    return typeof (value as { useClass: unknown }).useClass === "function";

  return false;
}
