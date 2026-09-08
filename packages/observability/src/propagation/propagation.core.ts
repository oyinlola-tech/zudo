/**
 * @zudojs/observability — Propagation
 *
 * Context propagation using AsyncLocalStorage for request-scoped
 * trace, span, request, and correlation IDs.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import type {
  PropagationContext,
  PropagationContextOptions,
  PropagationManager,
} from "../types.js";
import { generateSpanId, generateTraceId } from "../internal/index.js";

const storage = new AsyncLocalStorage<PropagationContext>();

/** Creates a new propagation context. */
export function createPropagationContext(
  options?: PropagationContextOptions,
): PropagationContext {
  return {
    traceId: options?.traceId ?? generateTraceId(),
    spanId: options?.spanId ?? generateSpanId(),
    parentSpanId: options?.parentSpanId,
    requestId: options?.requestId,
    correlationId: options?.correlationId,
    userId: options?.userId,
    service: options?.service,
    traceFlags: options?.traceFlags,
    baggage: options?.baggage
      ? Object.freeze({ ...options.baggage })
      : undefined,
  };
}

/**
 * Derives a child context from a parent.
 *
 * The trace ID, the sampling flags and the baggage all carry over: a child
 * that dropped the flags would break the sampling decision for everything
 * below it.
 */
export function derivePropagationContext(
  parent: PropagationContext,
  overrides?: PropagationContextOptions,
): PropagationContext {
  return createPropagationContext({
    traceId: overrides?.traceId ?? parent.traceId,
    spanId: overrides?.spanId ?? generateSpanId(),
    parentSpanId: parent.spanId,
    requestId: overrides?.requestId ?? parent.requestId,
    correlationId: overrides?.correlationId ?? parent.correlationId,
    userId: overrides?.userId ?? parent.userId,
    service: overrides?.service ?? parent.service,
    traceFlags: overrides?.traceFlags ?? parent.traceFlags,
    baggage: overrides?.baggage ?? parent.baggage,
  });
}

/**
 * The active propagation context, or `undefined` when there is none.
 *
 * Returning `undefined` rather than inventing a context keeps "no active
 * trace" distinguishable from a real one — two calls outside a `run()` scope
 * used to hand back two unrelated trace IDs.
 */
export function getCurrentContext(): PropagationContext | undefined {
  return storage.getStore();
}

/**
 * The active propagation context, creating a fresh one when there is none.
 *
 * Use this only where a context is genuinely required and a new trace is an
 * acceptable answer.
 */
export function requireCurrentContext(): PropagationContext {
  return storage.getStore() ?? createPropagationContext();
}

/**
 * PropagationManager implementation using AsyncLocalStorage.
 */
export class AsyncPropagationManager implements PropagationManager {
  current(): PropagationContext | undefined {
    return getCurrentContext();
  }

  async run<T>(
    context: PropagationContext,
    fn: () => T | Promise<T>,
  ): Promise<T> {
    return storage.run(context, fn);
  }

  runSync<T>(context: PropagationContext, fn: () => T): T {
    return storage.run(context, fn);
  }

  derive(overrides?: PropagationContextOptions): PropagationContext {
    const current = this.current();
    return current
      ? derivePropagationContext(current, overrides)
      : createPropagationContext(overrides);
  }
}

/** Creates a propagation manager. */
export function createPropagationManager(): AsyncPropagationManager {
  return new AsyncPropagationManager();
}
