/**
 * Route registry helper functions.
 *
 * @module httpRoute/registry/helpers
 */

import type {
  RouteRegistryEntry,
  RouteRegistryOptions,
} from "./httpRegistry.type.js";

const HTTP_METHODS = [
  "GET",
  "POST",
  "PUT",
  "DELETE",
  "PATCH",
  "HEAD",
  "OPTIONS",
  "TRACE",
  "CONNECT",
] as const;

export type HttpMethod = (typeof HTTP_METHODS)[number];

/**
 * Normalizes an HTTP method to uppercase.
 */
export function normalizeMethod(method: string): string {
  return method.toUpperCase();
}

/**
 * Normalizes one or more HTTP methods to uppercase.
 */
export function normalizeMethods(
  method: string | readonly string[],
): readonly string[] {
  const methods: readonly string[] =
    typeof method === "string" ? [method] : method;

  return methods.map(normalizeMethod);
}

/**
 * Checks if a string is a valid HTTP method.
 */
export function isHttpMethod(method: string): method is HttpMethod {
  return HTTP_METHODS.includes(method.toUpperCase() as HttpMethod);
}

/**
 * Normalizes a path based on registry options.
 */
export function normalizePath(
  path: string,
  options: RouteRegistryOptions,
): string {
  let normalized = path;

  if (!options.caseSensitive) {
    normalized = normalized.toLowerCase();
  }

  if (!options.strict) {
    normalized = normalized.replace(/\/+$/, "") || "/";
  }

  return normalized;
}

/**
 * Checks if an entry matches a lookup query.
 */
export function matchesLookup(
  entry: RouteRegistryEntry,
  path: string,
  method: string | undefined,
  options: RouteRegistryOptions,
): boolean {
  const normalizedPath = normalizePath(entry.path, options);

  if (normalizedPath !== path) {
    return false;
  }

  if (method && entry.method.toUpperCase() !== method.toUpperCase()) {
    return false;
  }

  return true;
}

/**
 * Extracts the sequence number from a path for sorting.
 */
export function extractSequence(path: string): number {
  const sequence = /:(\d+)/.exec(path)?.[1];
  return sequence === undefined ? 0 : parseInt(sequence, 10);
}
