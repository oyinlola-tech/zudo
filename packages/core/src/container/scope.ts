/**
 * Defines the lifetime of a dependency registered
 * with the Zudojs dependency injection container.
 */
export type Scope =
  /**
   * One instance for the lifetime of the application container.
   */
  | "singleton"

  /**
   * One instance per resolution scope.
   *
   * A scope is either an explicit `container.createScope()` or the
   * object returned by the container's `currentScope` callback (for
   * example the current ExecutionContext of an HTTP request,
   * background job, message consumption, or RPC call).
   *
   * Resolving a scoped provider with no active scope, or from inside a
   * singleton's construction (a captive dependency), throws a
   * DependencyResolutionError.
   */
  | "scoped"

  /**
   * A new instance every time the dependency is resolved.
   */
  | "transient";
