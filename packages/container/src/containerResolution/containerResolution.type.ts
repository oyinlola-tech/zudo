/**
 * Types for dependency resolution.
 */

import type { ContainerRegistration } from "../containerRegistration/containerRegistration.core.js";

import type { ContainerScope } from "../containerScope/containerScope.type.js";

import type { Token } from "../containerToken/containerToken.type.js";

/**
 * A cache containing resolved dependency instances.
 *
 * A plain `Map` satisfies this interface; scope caches created by the
 * resolver additionally fall back to their parent scope's cache for lookups
 * (see {@link ContainerResolver.createScope}).
 */
export interface ResolutionCache {
  has(token: Token<unknown>): boolean;
  get(token: Token<unknown>): unknown;
  set(token: Token<unknown>, value: unknown): void;
  clear(): void;
}

/**
 * Dependency resolution path.
 * Used for diagnostics and circular dependency detection.
 */
export type ResolutionPath = readonly Token<unknown>[];

/**
 * Options controlling dependency resolution.
 */
export interface ResolutionOptions {
  /**
   * Scope cache for SCOPED instances. When absent the resolution is a root
   * resolution and SCOPED registrations throw. SINGLETON instances always
   * live in the resolver's own singleton cache, never in this cache.
   */
  readonly cache?: ResolutionCache;
  /** Current dependency resolution path. Normally managed internally. */
  readonly path?: ResolutionPath;
  /** Whether unregistered class tokens may be resolved. Defaults to true. */
  readonly autoRegisterClasses?: boolean;
  /**
   * Whether auto-resolved class tokens may be added to the registry.
   * When false (e.g. registrations are frozen) unregistered classes are
   * instantiated ephemerally without being registered. Defaults to true.
   */
  readonly allowRegistration?: boolean;
  /** Whether circular dependencies are detected. Defaults to true. */
  readonly detectCircularDependencies?: boolean;
  /**
   * Maximum resolution chain depth before resolution aborts with a
   * MaxResolutionDepthError. Defaults to 100.
   */
  readonly maxResolutionDepth?: number;
  /**
   * Invoked for every instance the resolver creates during this resolution
   * (never for cache hits), in creation order — dependencies are reported
   * before their dependents. Owners use it to track instances for disposal.
   */
  readonly onInstanceCreated?: (result: ResolutionResult<unknown>) => void;
}

/**
 * Resolution result containing the resolved value and diagnostic information.
 */
export interface ResolutionResult<T> {
  readonly value: T;
  readonly token: Token<T>;
  readonly registration: ContainerRegistration<T>;
  readonly scope: ContainerScope;
  readonly fromCache: boolean;
  readonly path: ResolutionPath;
}
