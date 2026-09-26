/**
 * Custom JWT claim handling.
 *
 * @module authUtils/authUtils.claims
 */

/**
 * Claim names the token minter owns. A custom claim with one of these names
 * is dropped rather than embedded, so `user.claims` can never forge the
 * subject, lifetime, type, id, session binding, roles, issuer or audience of
 * a token.
 */
export const RESERVED_JWT_CLAIMS: ReadonlySet<string> = new Set([
  "sub",
  "iat",
  "exp",
  "nbf",
  "typ",
  "jti",
  "sid",
  "roles",
  "iss",
  "aud",
]);

/**
 * Return the custom claims that may be embedded in a token: every own,
 * enumerable entry of `claims` whose name is not reserved and whose value
 * is not `undefined`.
 *
 * @param claims - Custom claims, typically `AuthUser.claims`.
 * @returns A fresh plain object, or `undefined` when nothing survives.
 */
export function sanitizeCustomClaims(
  claims: Readonly<Record<string, unknown>> | undefined,
): Record<string, unknown> | undefined {
  if (!claims) return undefined;
  const result: Record<string, unknown> = {};
  let count = 0;
  for (const [name, value] of Object.entries(claims)) {
    if (RESERVED_JWT_CLAIMS.has(name) || value === undefined) continue;
    result[name] = value;
    count++;
  }
  return count > 0 ? result : undefined;
}
