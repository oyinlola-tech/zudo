/**
 * Middleware pipeline registration logic.
 *
 * @module httpMiddleware/pipeline/registration
 */

import type {
  HttpMiddleware,
  HttpMiddlewarePipelineOptions,
  InternalMiddleware,
  RegisteredMiddleware,
} from "../httpMiddleware.type.js";

import {
  isRegisteredMiddleware,
  normalizePriority,
  sanitizeName,
} from "./httpPipeline.helper.js";

export interface PipelineRegistration {
  readonly entries: InternalMiddleware[];
  readonly metadata: Readonly<Record<string, unknown>>;
  sequence: number;
}

export function createRegistration(
  options: HttpMiddlewarePipelineOptions = {},
): PipelineRegistration {
  const entries: InternalMiddleware[] = [];

  const metadata = Object.freeze({
    ...(options.metadata ?? {}),
  });

  let sequence = 0;

  for (const middleware of options.middlewares ?? []) {
    if (isRegisteredMiddleware(middleware)) {
      entries.push({
        id: middleware.id,
        middleware: middleware.middleware,
        name: middleware.name,
        priority: middleware.priority,
        enabled: middleware.enabled,
      });
    } else {
      use(entries, middleware, () => createId(entries, sequence++), {
        sequence: entries.length,
      });
    }
  }

  return { entries, metadata, sequence };
}

export interface UseRegistrationOptions {
  readonly name?: string;
  readonly priority?: number;
  readonly enabled?: boolean;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly sequence?: number;
}

export function use(
  entries: InternalMiddleware[],
  middleware: HttpMiddleware,
  createId: () => string,
  options: UseRegistrationOptions = {},
): () => void {
  if (typeof middleware !== "function") {
    throw new TypeError("HTTP middleware must be a function.");
  }

  const id = createId();

  entries.push({
    id,
    middleware,
    name: options.name ?? id,
    priority: normalizePriority(options.priority),
    /*
     * `sequence` is the registration-order tiebreaker `list()` sorts on. It
     * must be stored or equal priorities collapse to an arbitrary order.
     */
    sequence: options.sequence ?? entries.length,
    metadata: options.metadata,
    enabled: options.enabled ?? true,
  });

  return () => {
    remove(entries, id);
  };
}

export function remove(entries: InternalMiddleware[], id: string): boolean {
  const index = entries.findIndex((entry) => entry.id === id);

  if (index === -1) {
    return false;
  }

  entries.splice(index, 1);

  return true;
}

export function setEnabled(
  entries: InternalMiddleware[],
  id: string,
  enabled: boolean,
): boolean {
  const entry = entries.find((item) => item.id === id);

  if (!entry) {
    return false;
  }

  entry.enabled = enabled;

  return true;
}

export function has(entries: InternalMiddleware[], id: string): boolean {
  return entries.some((entry) => entry.id === id);
}

export function get(
  entries: InternalMiddleware[],
  id: string,
): RegisteredMiddleware | undefined {
  const entry = entries.find((item) => item.id === id);

  if (!entry) {
    return undefined;
  }

  return {
    id: entry.id,
    name: entry.name,
    priority: entry.priority,
    enabled: entry.enabled,
    middleware: entry.middleware,
  };
}

export function list(
  entries: InternalMiddleware[],
): readonly RegisteredMiddleware[] {
  return entries
    .filter((entry) => entry.enabled)
    .sort(
      (a, b) =>
        a.priority - b.priority || (a.sequence ?? 0) - (b.sequence ?? 0),
    )
    .map((entry) => ({
      id: entry.id,
      name: entry.name,
      priority: entry.priority,
      enabled: entry.enabled,
      middleware: entry.middleware,
    }));
}

export function createId(
  entries: InternalMiddleware[],
  sequence: number,
): string {
  return `${sanitizeName("middleware")}-${sequence}`;
}
