/**
 * Branded type definitions for the Identity service.
 */

export type UserId = string & { readonly __brand: "UserId" };

/**
 * Creates a branded UserId from a raw string.
 */
export function createUserId(id: string): UserId {
  return id as UserId;
}
