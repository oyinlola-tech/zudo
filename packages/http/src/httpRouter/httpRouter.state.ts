/**
 * Router-backed middleware state.
 *
 * Adapts the router context's state map to the `HttpMiddlewareState`
 * interface so middleware and route handlers share a single store.
 */

import type { HttpMiddlewareState } from "../httpMiddleware/httpMiddleware.type.js";

export class RouterMiddlewareState implements HttpMiddlewareState {
  private readonly store: Map<string, unknown>;

  constructor(store: Map<string, unknown> = new Map<string, unknown>()) {
    this.store = store;
  }

  get<T = unknown>(key: string): T | undefined {
    return this.store.get(key) as T | undefined;
  }

  set<T = unknown>(key: string, value: T): void {
    this.store.set(key, value);
  }

  has(key: string): boolean {
    return this.store.has(key);
  }

  delete(key: string): boolean {
    return this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  entries(): IterableIterator<readonly [string, unknown]> {
    return this.store.entries();
  }
}
