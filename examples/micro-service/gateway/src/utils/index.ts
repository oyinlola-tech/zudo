import { randomBytes } from "node:crypto";

/**
 * Generates a unique request ID for tracing.
 */
export function generateId(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Parses a string value into a boolean.
 */
export function parseBoolean(
  value: string | undefined,
  defaultValue = false,
): boolean {
  if (value === undefined) return defaultValue;
  return value === "true" || value === "1";
}

/**
 * Extracts the bearer token from an Authorization header.
 */
export function extractBearerToken(
  authorization: string | undefined,
): string | null {
  if (!authorization) return null;
  const parts = authorization.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") return null;
  return parts[1] ?? null;
}

/**
 * Builds a query string from a URL search params string.
 */
export function buildQueryString(search: string): string {
  return search ? `?${search}` : "";
}
