/**
 * HTTP interceptor manager implementation.
 *
 * @module httpInterceptors/manager
 */

import type {
  InterceptorPhase,
  HttpInterceptorOptions,
  RegisteredHttpInterceptor,
  HttpInterceptorManagerOptions,
  HttpInterceptorSnapshot,
} from "../httpInterceptor.type.js";

import { InterceptorRegistry } from "./httpInterceptor.registration.js";
import { createSnapshot } from "./httpInterceptor.snapshot.js";
import {
  findByPhase,
  enable,
  disable,
  getAll,
} from "./httpInterceptor.lookup.js";

export class HttpInterceptorManager<T> {
  private readonly registry: InterceptorRegistry<T>;
  private readonly options: HttpInterceptorManagerOptions;

  constructor(options: HttpInterceptorManagerOptions = {}) {
    this.options = {
      maxInterceptors: 100,
      strictPhase: false,
      allowDuplicateNames: false,
      ...options,
    };
    this.registry = new InterceptorRegistry<T>(this.options);
  }

  register(handler: T, options: HttpInterceptorOptions = {}): string {
    return this.registry.register(handler, options);
  }

  unregister(id: string): boolean {
    return this.registry.unregister(id);
  }

  get(id: string): RegisteredHttpInterceptor<T> | undefined {
    return this.registry.get(id);
  }

  has(id: string): boolean {
    return this.registry.has(id);
  }

  hasByName(name: string): boolean {
    return this.registry.hasByName(name);
  }

  findByPhase(
    phase: InterceptorPhase,
  ): readonly RegisteredHttpInterceptor<T>[] {
    return findByPhase(this.registry.underlying, phase);
  }

  enable(id: string): boolean {
    return enable(this.registry.underlying, id);
  }

  disable(id: string): boolean {
    return disable(this.registry.underlying, id);
  }

  clear(): void {
    this.registry.clear();
  }

  snapshot(): HttpInterceptorSnapshot {
    return createSnapshot(this.registry);
  }

  getAll(): readonly RegisteredHttpInterceptor<T>[] {
    return getAll(this.registry.underlying);
  }

  get size(): number {
    return this.registry.size;
  }
}
