import type { APIContextKey } from "./contextKey.type.js";

import {
  RequestIdContextKey,
  CorrelationIdContextKey,
  TenantIdContextKey,
  UserIdContextKey,
  StartTimeContextKey,
  createContextKey,
} from "./contextKey.type.js";

/**
 * Generic API context that flows through the execution pipeline.
 *
 * Uses typed keys to avoid god-object anti-pattern.
 */
export interface APIContext<TState = unknown> {
  readonly requestId: string;

  readonly signal?: AbortSignal;

  readonly state: TState;

  get<T>(key: APIContextKey<T>): T | undefined;

  set<T>(key: APIContextKey<T>, value: T): void;

  readonly metadata: ReadonlyMap<string, unknown>;
}

/**
 * Creates a new API context.
 */
export function createAPIContext<TState = unknown>(
  requestId: string,
  state: TState,
  signal?: AbortSignal,
): APIContext<TState> {
  const metadata = new Map<string, unknown>();

  metadata.set(RequestIdContextKey.name, requestId);

  const context = {
    requestId,
    signal,
    state,
    get<T>(key: APIContextKey<T>): T | undefined {
      return metadata.get(key.name) as T | undefined;
    },
    set<T>(key: APIContextKey<T>, value: T): void {
      metadata.set(key.name, value);
    },
    // Live read-only view of the internal map (no per-access copy).
    get metadata(): ReadonlyMap<string, unknown> {
      return metadata;
    },
  };

  return Object.freeze(context) as APIContext<TState>;
}

export type { APIContextKey };

export {
  RequestIdContextKey,
  CorrelationIdContextKey,
  TenantIdContextKey,
  UserIdContextKey,
  StartTimeContextKey,
  createContextKey,
};
