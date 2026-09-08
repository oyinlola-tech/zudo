/**
 * Observability helpers for authorization events and metrics.
 *
 * @module observability/observability
 */

import type { PermissionDecision } from "../permissionTypes/index.js";

/** Event emitted when a permission check completes. */
export interface PermissionCheckEvent {
  /** Actor ID. */
  readonly actorId: string;
  /** Permission checked. */
  readonly permission: string;
  /** Resource type (if available). */
  readonly resourceType?: string;
  /** Whether allowed. A check that threw is recorded as not allowed. */
  readonly allowed: boolean;
  /** Decision reason, or `error:<Name>` when the check threw. */
  readonly reason?: string;
  /** Evaluation duration in ms. */
  readonly durationMs: number;
  /** Whether the check ended in an exception rather than a decision. */
  readonly errored?: boolean;
}

/** Handler for permission events. */
export type PermissionEventHandler = (event: PermissionCheckEvent) => void;

/** Emits authorization audit events. */
export interface PermissionEventEmitter {
  /** Register a handler. Returns an unsubscribe function. */
  on(handler: PermissionEventHandler): () => void;
  /** Emit a permission check event. */
  emit(event: PermissionCheckEvent): void;
  /** Number of registered handlers. */
  readonly size: number;
}

/** Options for {@link createPermissionEventEmitter}. */
export interface PermissionEventEmitterOptions {
  /**
   * Reports a handler that threw.
   *
   * Handler errors are swallowed so a broken audit sink cannot break
   * authorization — but a sink that is silently failing is worse than one
   * that is loudly failing, so this is where it surfaces.
   */
  readonly onHandlerError?: (
    error: unknown,
    event: PermissionCheckEvent,
  ) => void;
}

/**
 * Create a permission event emitter.
 */
export function createPermissionEventEmitter(
  options?: PermissionEventEmitterOptions,
): PermissionEventEmitter {
  const handlers = new Set<PermissionEventHandler>();

  return {
    on(handler: PermissionEventHandler): () => void {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },

    emit(event: PermissionCheckEvent): void {
      for (const handler of handlers) {
        try {
          handler(event);
        } catch (error) {
          options?.onHandlerError?.(error, event);
        }
      }
    },

    get size(): number {
      return handlers.size;
    },
  };
}

/**
 * Wrap a permission check with observability.
 *
 * The event is emitted from a `finally`, so a check that throws is recorded
 * too — the exception paths are exactly the ones an audit trail must not
 * miss.
 *
 * Prefer passing an emitter to `createPermissionEngine({ emitter })`, which
 * instruments every check the engine makes.
 */
export function withObservability<TArgs extends readonly unknown[]>(
  emitter: PermissionEventEmitter,
  fn: (...args: TArgs) => Promise<PermissionDecision>,
): (...args: TArgs) => Promise<PermissionDecision> {
  return async (...args: TArgs): Promise<PermissionDecision> => {
    const start = performance.now();
    let decision: PermissionDecision | undefined;
    let failure: unknown;

    try {
      decision = await fn(...args);
      return decision;
    } catch (error) {
      failure = error;
      throw error;
    } finally {
      const actor = args[0] as { readonly id?: string } | undefined;
      const resource = args[2];
      emitter.emit({
        actorId: actor?.id ?? "unknown",
        permission: typeof args[1] === "string" ? args[1] : "unknown",
        resourceType:
          typeof resource === "object" && resource !== null
            ? ((resource as { type?: string }).type ??
              resource.constructor?.name)
            : undefined,
        allowed: decision?.allowed ?? false,
        reason:
          decision?.reason ??
          (failure instanceof Error ? `error:${failure.name}` : undefined),
        durationMs: performance.now() - start,
        errored: failure !== undefined,
      });
    }
  };
}
