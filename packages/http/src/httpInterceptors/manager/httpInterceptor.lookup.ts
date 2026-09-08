/**
 * Interceptor lookup and management.
 *
 * @module httpInterceptors/manager/lookup
 */

import type {
  InterceptorPhase,
  InterceptorPriority,
  RegisteredHttpInterceptor,
  InternalInterceptor,
} from "../httpInterceptor.type.js";

function comparePriority(
  a: InterceptorPriority,
  b: InterceptorPriority,
): number {
  const order: Record<InterceptorPriority, number> = {
    first: 0,
    high: 1,
    normal: 2,
    low: 3,
    last: 4,
  };
  return order[a] - order[b];
}

export function findByPhase<T>(
  interceptors: Map<string, InternalInterceptor<T>>,
  phase: InterceptorPhase,
): readonly RegisteredHttpInterceptor<T>[] {
  return getAll(interceptors)
    .filter((i) => i.metadata.phase === phase && i.metadata.enabled)
    .sort((a, b) => comparePriority(a.metadata.priority, b.metadata.priority));
}

export function enable<T>(
  interceptors: Map<string, InternalInterceptor<T>>,
  id: string,
): boolean {
  const interceptor = interceptors.get(id);
  if (!interceptor) {
    return false;
  }

  interceptors.set(id, {
    ...interceptor,
    metadata: {
      ...interceptor.metadata,
      enabled: true,
    },
  });
  return true;
}

export function disable<T>(
  interceptors: Map<string, InternalInterceptor<T>>,
  id: string,
): boolean {
  const interceptor = interceptors.get(id);
  if (!interceptor) {
    return false;
  }

  interceptors.set(id, {
    ...interceptor,
    metadata: {
      ...interceptor.metadata,
      enabled: false,
    },
  });
  return true;
}

export function getAll<T>(
  interceptors: Map<string, InternalInterceptor<T>>,
): readonly RegisteredHttpInterceptor<T>[] {
  /*
   * Sort on the stored registration sequence. Parsing the trailing digits out
   * of the id collided across name prefixes ("auth-1" vs "audit-1").
   */
  return Array.from(interceptors.values())
    .sort((a, b) => a.sequence - b.sequence)
    .map((i) => ({
      metadata: i.metadata,
      handler: i.handler,
      options: i.options,
    }));
}
