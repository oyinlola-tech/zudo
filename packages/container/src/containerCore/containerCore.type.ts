/**
 * Types for the core container.
 */

import type { RegistrationToken } from "../containerRegistration/containerRegistration.core.js";
import type {
  ResolutionCache,
  ResolutionResult,
} from "../containerResolution/containerResolution.type.js";
import type { ContainerScopeContext } from "./containerCore.scope.js";

/**
 * Options used when creating a child container scope.
 */
export interface ContainerScopeOptions {
  /**
   * Optional name for the child scope.
   */
  readonly name?: string;

  /**
   * Optional metadata for the scope.
   */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * The surface a ContainerScopeContext needs from its owning container.
 * Implemented by Container; the `resolveInScope` / `createScopeCache` /
 * `releaseScope` members are internal plumbing for scopes and should not be
 * called by application code.
 */
export interface ContainerLike {
  readonly name: string;
  has<T>(token: RegistrationToken<T>): boolean;
  canResolve<T>(token: RegistrationToken<T>): boolean;
  isDisposed(): boolean;
  createScope(options?: ContainerScopeOptions): ContainerScopeContext;
  /**
   * @internal Creates a fresh scoped-instance cache, optionally chained to a
   * parent scope's cache (nested scopes).
   */
  createScopeCache(parent?: ResolutionCache): ResolutionCache;
  /**
   * @internal Resolves a token using the given scope cache. `onInstanceCreated`
   * is invoked for every instance created during the resolution (including
   * transitively created dependencies) so the scope can track SCOPED ones.
   */
  resolveInScope<T>(
    token: RegistrationToken<T>,
    cache: ResolutionCache,
    onInstanceCreated?: (result: ResolutionResult<unknown>) => void,
  ): ResolutionResult<T>;
  /** @internal Unregisters a top-level scope from the container's live-scope set. */
  releaseScope(scope: ContainerScopeContext): void;
}
