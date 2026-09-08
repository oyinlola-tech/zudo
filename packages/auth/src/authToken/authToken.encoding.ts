/**
 * Internal base64url + JWT segment helpers.
 *
 * @module authToken/authToken.encoding
 *
 * Not exported from the package barrel. Every JWT segment in this package —
 * verified or not — is decoded through here so that the bounds and the
 * decoding rules stay in exactly one place.
 */

/**
 * Maximum accepted length, in characters, of a complete JWT.
 *
 * An HS256 JWT with a generous set of claims is well under 2 KB; 8 KB is the
 * conventional HTTP header limit. Anything larger is rejected before it is
 * decoded so that an unauthenticated request cannot make the process
 * allocate and parse an arbitrarily large buffer.
 */
export const MAX_TOKEN_LENGTH = 8192;

/**
 * Maximum accepted length, in characters, of the JOSE header segment.
 * A real header (`{"alg":"HS256","typ":"JWT"}`) is 36 characters encoded.
 */
export const MAX_HEADER_SEGMENT_LENGTH = 1024;

/** Encode a UTF-8 string as base64url. */
export function base64UrlEncode(data: string): string {
  return Buffer.from(data, "utf-8").toString("base64url");
}

/** Decode a base64url segment to a UTF-8 string. */
export function base64UrlDecode(data: string): string {
  return Buffer.from(data, "base64url").toString("utf-8");
}

/**
 * Split a JWT into its three segments, rejecting anything that is not a
 * string, is empty, or exceeds {@link MAX_TOKEN_LENGTH}.
 *
 * @returns The three segments, or `null` when the input is not a
 *   plausibly-shaped, in-bounds JWT.
 */
export function splitToken(
  token: unknown,
): readonly [string, string, string] | null {
  if (typeof token !== "string") return null;
  if (token.length === 0 || token.length > MAX_TOKEN_LENGTH) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, signature] = parts as [string, string, string];
  if (header.length > MAX_HEADER_SEGMENT_LENGTH) return null;
  if (header.length === 0 || body.length === 0 || signature.length === 0) {
    return null;
  }
  return [header, body, signature];
}

/**
 * Decode a JWT body segment into a plain object.
 *
 * @returns The parsed object, or `null` when the segment is not valid JSON
 *   or does not decode to a non-null, non-array object.
 */
export function decodeJsonSegment(
  segment: string,
): Record<string, unknown> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(base64UrlDecode(segment));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  return parsed as Record<string, unknown>;
}
