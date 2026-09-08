/**
 * HTTP interceptor types.
 *
 * @module httpInterceptors/types
 */

export type InterceptorPhase =
  "request" | "response" | "error" | "before-request" | "after-request";

export type InterceptorPriority = "first" | "high" | "normal" | "low" | "last";

export interface HttpInterceptorMetadata {
  readonly id: string;
  readonly name: string;
  readonly phase: InterceptorPhase;
  readonly priority: InterceptorPriority;
  readonly enabled: boolean;
  readonly description?: string;
  readonly tags: readonly string[];
}

export interface HttpInterceptorOptions {
  readonly name?: string;
  readonly phase?: InterceptorPhase;
  readonly priority?: InterceptorPriority;
  readonly enabled?: boolean;
  readonly description?: string;
  readonly tags?: readonly string[];
}

export interface RegisteredHttpInterceptor<T> {
  readonly metadata: HttpInterceptorMetadata;
  readonly handler: T;
  readonly options: HttpInterceptorOptions;
}

export interface HttpInterceptorManagerOptions {
  readonly maxInterceptors?: number;
  readonly strictPhase?: boolean;
  readonly allowDuplicateNames?: boolean;
}

export interface HttpInterceptorSnapshot {
  readonly interceptors: readonly HttpInterceptorMetadata[];
  readonly timestamp: number;
  readonly version: number;
}

export interface InternalInterceptor<T> {
  readonly id: string;

  /** Monotonic registration order, used to keep the chain stable. */
  readonly sequence: number;
  readonly metadata: HttpInterceptorMetadata;
  readonly handler: T;
  readonly options: HttpInterceptorOptions;
}
