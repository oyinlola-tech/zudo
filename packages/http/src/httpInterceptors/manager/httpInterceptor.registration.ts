/**
 * Interceptor registration.
 *
 * @module httpInterceptors/manager/registration
 */

import type {
  InterceptorPhase,
  HttpInterceptorMetadata,
  HttpInterceptorOptions,
  RegisteredHttpInterceptor,
  InternalInterceptor,
} from "../httpInterceptor.type.js";

import { normalizePriority, sanitizeName } from "../httpInterceptor.helper.js";

export interface InterceptorRegistryOptions {
  readonly maxInterceptors?: number;
  readonly strictPhase?: boolean;
  readonly allowDuplicateNames?: boolean;
}

function generateId(name: string | undefined, sequence: number): string {
  const base = name ? sanitizeName(name) : "interceptor";
  return `${base}-${sequence}`;
}

const INTERCEPTOR_PHASES: readonly InterceptorPhase[] = [
  "request",
  "response",
  "error",
  "before-request",
  "after-request",
];

export class InterceptorRegistry<T> {
  private readonly interceptors = new Map<string, InternalInterceptor<T>>();
  private version = 0;

  /*
   * Ids used to be derived from `Map.size`, which *decreases* on unregister.
   * Registering after an unregister therefore reproduced a live id and
   * `Map.set` silently replaced the interceptor holding it. A counter that
   * only ever increases cannot collide.
   */
  private sequence = 0;

  private readonly options: InterceptorRegistryOptions;

  constructor(options: InterceptorRegistryOptions = {}) {
    this.options = options;
  }

  register(handler: T, options: HttpInterceptorOptions = {}): string {
    const maxInterceptors = this.options.maxInterceptors;

    if (
      maxInterceptors !== undefined &&
      this.interceptors.size >= maxInterceptors
    ) {
      throw new RangeError(
        `Cannot register interceptor: the configured maximum of ${maxInterceptors} is already registered.`,
      );
    }

    if (
      this.options.allowDuplicateNames === false &&
      options.name !== undefined &&
      this.hasByName(options.name)
    ) {
      throw new Error(
        `An interceptor named "${options.name}" is already registered.`,
      );
    }

    if (
      this.options.strictPhase === true &&
      options.phase !== undefined &&
      !INTERCEPTOR_PHASES.includes(options.phase)
    ) {
      throw new TypeError(`Unknown interceptor phase "${options.phase}".`);
    }

    const sequence = this.sequence++;

    const id = generateId(options.name, sequence);

    if (this.interceptors.has(id)) {
      throw new Error(`An interceptor with id "${id}" is already registered.`);
    }

    const name = options.name ?? id;
    const phase = options.phase ?? "request";
    const priority = normalizePriority(options.priority ?? "normal");

    const metadata: HttpInterceptorMetadata = {
      id,
      name,
      phase,
      priority,
      enabled: options.enabled ?? true,
      description: options.description,
      tags: options.tags ?? [],
    };

    const interceptor: InternalInterceptor<T> = {
      id,
      sequence,
      metadata,
      handler,
      options,
    };

    this.interceptors.set(id, interceptor);
    this.version++;
    return id;
  }

  unregister(id: string): boolean {
    const existed = this.interceptors.delete(id);
    if (existed) {
      this.version++;
    }
    return existed;
  }

  get(id: string): RegisteredHttpInterceptor<T> | undefined {
    const interceptor = this.interceptors.get(id);
    if (!interceptor) {
      return undefined;
    }
    return {
      metadata: interceptor.metadata,
      handler: interceptor.handler,
      options: interceptor.options,
    };
  }

  has(id: string): boolean {
    return this.interceptors.has(id);
  }

  hasByName(name: string): boolean {
    for (const interceptor of this.interceptors.values()) {
      if (interceptor.metadata.name === name) {
        return true;
      }
    }
    return false;
  }

  clear(): void {
    this.interceptors.clear();
    this.version++;
  }

  get size(): number {
    return this.interceptors.size;
  }

  get version_number(): number {
    return this.version;
  }

  get underlying(): Map<string, InternalInterceptor<T>> {
    return this.interceptors;
  }
}
