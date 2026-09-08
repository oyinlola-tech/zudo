/**
 * HTTP interceptor helper functions.
 *
 * @module httpInterceptors/helpers
 */

import type { InterceptorPriority } from "./httpInterceptor.type.js";

/**
 * Normalizes a priority string.
 */
export function normalizePriority(
  priority: InterceptorPriority | string,
): InterceptorPriority {
  const normalized = priority.toLowerCase();
  switch (normalized) {
    case "first":
    case "high":
    case "normal":
    case "low":
    case "last":
      return normalized as InterceptorPriority;
    default:
      return "normal";
  }
}

/**
 * Sanitizes a name for use as an identifier.
 */
export function sanitizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Compares two IDs for ordering.
 */
export function compareIds(a: string, b: string): number {
  return a.localeCompare(b);
}

/**
 * Extracts a sequence number from an ID.
 */
export function extractSequence(id: string): number {
  const digits = id.match(/-(\d+)$/)?.[1];
  return digits === undefined ? 0 : parseInt(digits, 10);
}

/**
 * Generates a default request ID.
 */
export function defaultRequestId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `req-${timestamp}-${random}`;
}
