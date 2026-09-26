/**
 * @zudojs/lifecycle/component
 *
 * Lifecycle component interface — the contract for managed resources.
 */

import type { LifecycleContext } from "../lifecycleContext/lifecycleContext.type.js";

/**
 * Interface for components that participate in the lifecycle.
 * All hook methods are optional — components only implement what they need.
 */
export interface LifecycleComponent {
  /** Unique name identifying this component. */
  readonly name: string;

  /** Initialize the component (prepare configuration, create internal objects). */
  initialize?(context: LifecycleContext): Promise<void>;

  /** Start the component (connect to databases, start servers). */
  start?(context: LifecycleContext): Promise<void>;

  /** Confirm the component is ready to serve (health check, warm-up). */
  ready?(context: LifecycleContext): Promise<void>;

  /** Gracefully stop the component (stop accepting work, drain queues). */
  stop?(context: LifecycleContext): Promise<void>;

  /** Final resource cleanup (close connections, clear timers). */
  dispose?(context: LifecycleContext): Promise<void>;
}

/** Options for registering a lifecycle component. */
export interface LifecycleRegistrationOptions {
  /** Unique ID for this component. Defaults to component.name. */
  readonly id?: string;

  /** IDs of components that must start before this one. */
  readonly dependsOn?: readonly string[];

  /**
   * Priority for ordering within the same dependency level. Higher = earlier.
   *
   * Priority is a barrier, not a hint: every component at one priority
   * finishes the phase before the next priority begins, and shutdown
   * runs the mirror image (lowest priority stops first). Components
   * sharing a priority still run concurrently.
   */
  readonly priority?: number;

  /** If true, application startup fails when this component fails. Defaults to true. */
  readonly critical?: boolean;

  /**
   * Timeout in ms for each hook invocation. Defaults to
   * `LIFECYCLE_DEFAULT_TIMEOUT` (30 s). `Infinity` means no bound; NaN
   * and negative values are rejected at registration.
   *
   * When it elapses the hook's `context.signal` is aborted, the hook is
   * recorded as failed with `timedOut: true` and is never retried, and
   * startup rolls back. The same budget bounds the wait, before this
   * component's `stop()`/`dispose()`, for an earlier hook of this
   * component that is still running after its own timeout.
   */
  readonly timeout?: number;

  /** Retry configuration for failed operations. */
  readonly retry?: LifecycleRetryOptions;
}

/**
 * Retry options for component operations.
 *
 * Retries apply to every phase hook. A hook that threw (or rejected)
 * is retried after a delay; a hook that exceeded `timeout` is never
 * retried, because it is still running and cannot be cancelled. Each
 * retry is announced through the `component:retrying` event.
 */
export interface LifecycleRetryOptions {
  /**
   * Number of retries after the first call, not the total number of
   * calls: `attempts: 3` allows up to four invocations. Defaults to 0.
   */
  readonly attempts?: number;

  /** Delay before the first retry in ms. Defaults to 500. */
  readonly delay?: number;

  /** Cap on the delay between retries in ms. Defaults to 10 000. */
  readonly maxDelay?: number;

  /**
   * Backoff strategy. `"exponential"` (the default) doubles `delay` on
   * every retry up to `maxDelay`; `"fixed"` waits `delay` each time.
   */
  readonly backoff?: "fixed" | "exponential";
}

/** A component with its registration metadata. */
export interface LifecycleRegistration {
  /** Unique ID. */
  readonly id: string;

  /** The component instance. */
  readonly component: LifecycleComponent;

  /** IDs of dependencies. */
  readonly dependsOn: readonly string[];

  /** Priority within same dependency level. */
  readonly priority: number;

  /** Whether failure should abort application startup. */
  readonly critical: boolean;

  /** Timeout in ms for individual operations. */
  readonly timeout: number;

  /** Retry configuration. */
  readonly retry: LifecycleRetryOptions;
}
