import { randomUUID } from "node:crypto";

import { MAX_REQUEST_ID_LENGTH } from "../constants.js";

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

  /**
   * Stores a value under a typed key.
   *
   * @throws {TypeError} for {@link RequestIdContextKey}, which is fixed at
   * construction so `get(RequestIdContextKey)` can never disagree with
   * `context.requestId`.
   */
  set<T>(key: APIContextKey<T>, value: T): void;

  /**
   * Read-only snapshot of the context values, keyed by context key name.
   *
   * This is a genuine read-only façade, not the context's backing store:
   * it has no mutating methods at all, so casting it to `Map` and calling
   * `set`/`delete`/`clear` throws rather than mutating the context.
   */
  readonly metadata: ReadonlyMap<string, unknown>;
}

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;

/**
 * Determines whether a value is usable as a request id.
 *
 * A valid request id is a non-empty string of at most
 * {@link MAX_REQUEST_ID_LENGTH} characters drawn from `[A-Za-z0-9._:-]`.
 * The charset excludes CR/LF and other control characters, so a request id
 * is always safe to place in a log line or a response header.
 */
export function isValidRequestId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_REQUEST_ID_LENGTH &&
    REQUEST_ID_PATTERN.test(value)
  );
}

/**
 * Normalizes an untrusted request id.
 *
 * Transports typically populate the request id from an inbound
 * `X-Request-Id` / `X-Correlation-Id` header, i.e. straight from the
 * network. Pass that value through this function before handing it to
 * {@link createAPIContext}: valid ids are returned unchanged, anything
 * else (missing, empty, over-long, or containing characters that would
 * allow log injection or response splitting) is replaced by a freshly
 * generated UUID.
 */
export function normalizeRequestId(value: unknown): string {
  return isValidRequestId(value) ? value : randomUUID();
}

/**
 * Creates a new API context.
 *
 * @throws {TypeError} if `requestId` is not a valid request id. Use
 * {@link normalizeRequestId} for client-supplied values.
 */
export function createAPIContext<TState = unknown>(
  requestId: string,
  state: TState,
  signal?: AbortSignal,
): APIContext<TState> {
  if (!isValidRequestId(requestId)) {
    throw new TypeError(
      `Invalid requestId: expected a non-empty string of at most ${MAX_REQUEST_ID_LENGTH} characters matching ${REQUEST_ID_PATTERN.source}. Use normalizeRequestId() for client-supplied values.`,
    );
  }

  // Values are stored under the key's unique `id` symbol, so keys sharing
  // a `name` never share a slot.
  const store = new Map<symbol, unknown>();
  const names = new Map<symbol, string>();

  const remember = (key: APIContextKey<unknown>): void => {
    names.set(key.id, key.name);
  };

  remember(RequestIdContextKey);
  store.set(RequestIdContextKey.id, requestId);

  let view: ReadonlyMap<string, unknown> | undefined;

  const context = {
    requestId,
    signal,
    state,
    get<T>(key: APIContextKey<T>): T | undefined {
      return store.get(key.id) as T | undefined;
    },
    set<T>(key: APIContextKey<T>, value: T): void {
      if (key.id === RequestIdContextKey.id) {
        throw new TypeError(
          "requestId is fixed at context creation and cannot be reassigned.",
        );
      }
      remember(key as APIContextKey<unknown>);
      store.set(key.id, value);
      view = undefined;
    },
    get metadata(): ReadonlyMap<string, unknown> {
      if (view === undefined) {
        const snapshot = new Map<string, unknown>();
        for (const [id, value] of store) {
          snapshot.set(names.get(id) ?? id.toString(), value);
        }
        view = createReadonlyMapView(snapshot);
      }
      return view;
    },
  };

  return Object.freeze(context) as APIContext<TState>;
}

/**
 * Wraps a private map in a frozen object exposing only the read half of
 * the `ReadonlyMap` interface. The wrapped map is unreachable from the
 * returned value, so there is no cast that recovers mutation rights.
 */
function createReadonlyMapView<K, V>(source: Map<K, V>): ReadonlyMap<K, V> {
  const view: ReadonlyMap<K, V> = {
    get size(): number {
      return source.size;
    },
    get: (key: K) => source.get(key),
    has: (key: K) => source.has(key),
    keys: () => source.keys(),
    values: () => source.values(),
    entries: () => source.entries(),
    forEach: (
      callback: (value: V, key: K, map: ReadonlyMap<K, V>) => void,
      thisArg?: unknown,
    ) => {
      for (const [key, value] of source) {
        callback.call(thisArg, value, key, view);
      }
    },
    [Symbol.iterator]: () => source[Symbol.iterator](),
  };

  return Object.freeze(view);
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
