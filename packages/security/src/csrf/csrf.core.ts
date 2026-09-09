/**
 * @zudojs/security — CSRF Protection
 *
 * Generates and validates CSRF tokens for state-changing requests.
 *
 * Two patterns are supported, both built on the same signed token:
 *
 * - **Synchroniser token** (recommended). The server stores the token in an
 *   `HttpOnly` cookie via {@link generateCsrfCookie} and renders the same
 *   token into the page or form. The browser returns it in a header or field,
 *   and {@link verifyDoubleSubmit} compares the two. Script on the page never
 *   needs to read the cookie, so `HttpOnly` stays on.
 * - **Double-submit cookie.** Client-side script reads the cookie and echoes
 *   it into a header. This requires `httpOnly: false` on the cookie — pass it
 *   explicitly, and understand that any XSS on the origin can then read the
 *   token.
 *
 * Bind the token to a session wherever you have one: without `sessionId`, a
 * token minted for one user validates for every other user.
 */

import type { CsrfConfig } from "../types/security.type.js";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** Default token expiration (1 hour). */
const DEFAULT_EXPIRATION = 3600;

/** Default cookie name for CSRF token. */
const DEFAULT_COOKIE_NAME = "_csrf";

/** Default header name for CSRF token. */
const DEFAULT_HEADER_NAME = "x-csrf-token";

/** Methods that require CSRF protection. */
const SAFE_METHODS = ["GET", "HEAD", "OPTIONS", "TRACE"];

/** Default methods that require CSRF protection. */
const DEFAULT_METHODS = ["POST", "PUT", "PATCH", "DELETE"];

/**
 * Minimum accepted secret length, in characters.
 *
 * The signature is HMAC-SHA256, so a secret shorter than the 32-byte output
 * adds no strength beyond its own length. `"CSRF secret cannot be empty"` was
 * the only check, which accepted a one-character secret in silence.
 */
export const MIN_CSRF_SECRET_LENGTH = 32;

/** Rejects a secret too short to be worth signing with. */
function assertUsableSecret(secret: string): void {
  if (secret.length === 0) {
    throw new Error(
      "CSRF secret cannot be empty: pass a random string of at least " +
        `${MIN_CSRF_SECRET_LENGTH} characters, e.g. randomBytes(32).toString("hex")`,
    );
  }
  if (secret.length < MIN_CSRF_SECRET_LENGTH) {
    throw new Error(
      `CSRF secret is too short: got ${secret.length} characters, expected at least ` +
        `${MIN_CSRF_SECRET_LENGTH}. The signature is HMAC-SHA256, so a shorter ` +
        'secret adds no strength. Generate one with randomBytes(32).toString("hex").',
    );
  }
}

/** Options accepted by token generation and validation. */
export interface CsrfTokenOptions {
  /** Token lifetime in seconds (default: 3600). */
  readonly expiration?: number;
  /**
   * Session identifier to bind the token to.
   *
   * Strongly recommended: an unbound token is valid for every user, so an
   * attacker can mint one with their own session and replay it against a
   * victim's.
   */
  readonly sessionId?: string;
}

/**
 * Computes the token signature.
 *
 * HMAC-SHA256 rather than `sha256(payload + secret)`: the plain-hash form is a
 * secret-suffix construction with no security proof, and truncating it to 64
 * bits leaves far too little margin.
 */
function sign(
  secret: string,
  expiresAt: number,
  random: string,
  sessionId: string,
): string {
  return createHmac("sha256", secret)
    .update(`${expiresAt}:${random}:${sessionId}`)
    .digest("hex");
}

/** Constant-time string comparison that does not leak length via early exit. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    // Still burn a comparison so the timing profile does not distinguish a
    // length mismatch from a content mismatch.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/**
 * Generates a cryptographically secure CSRF token.
 *
 * @param secret - The secret key for HMAC generation.
 * @param options - Expiration and session binding, or a bare expiration in
 *   seconds for backwards compatibility.
 * @returns The CSRF token string, in the form `expiresAt:random:signature`.
 */
export function generateCsrfToken(
  secret: string,
  options?: number | CsrfTokenOptions,
): string {
  assertUsableSecret(secret);

  const opts: CsrfTokenOptions =
    typeof options === "number" ? { expiration: options } : (options ?? {});
  const ttl = opts.expiration ?? DEFAULT_EXPIRATION;

  if (!Number.isFinite(ttl) || ttl <= 0) {
    throw new RangeError(`CSRF expiration must be positive, got: ${ttl}`);
  }

  const expiresAt = Math.floor(Date.now() / 1000) + ttl;
  const random = randomBytes(16).toString("hex");
  const signature = sign(secret, expiresAt, random, opts.sessionId ?? "");

  return `${expiresAt}:${random}:${signature}`;
}

/**
 * Validates a CSRF token.
 *
 * @param token - The CSRF token to validate.
 * @param secret - The secret key for verification.
 * @param options - Maximum lifetime and session binding, or a bare expiration
 *   in seconds for backwards compatibility.
 * @returns True if the token is valid, unexpired, and bound to this session.
 */
export function validateCsrfToken(
  token: string,
  secret: string,
  options?: number | CsrfTokenOptions,
): boolean {
  const opts: CsrfTokenOptions =
    typeof options === "number" ? { expiration: options } : (options ?? {});
  const maxTtl = opts.expiration ?? DEFAULT_EXPIRATION;

  const parts = token.split(":");

  if (parts.length !== 3) {
    return false;
  }

  const [expiresAtStr, random, providedSignature] = parts;

  if (!expiresAtStr || !random || !providedSignature) {
    return false;
  }

  if (!/^\d+$/.test(expiresAtStr)) {
    return false;
  }

  const expiresAt = Number(expiresAtStr);

  if (!Number.isSafeInteger(expiresAt)) {
    return false;
  }

  const now = Math.floor(Date.now() / 1000);

  // Expired.
  if (now > expiresAt) {
    return false;
  }

  // Issued with a longer lifetime than this caller is willing to honour. The
  // expiry is inside the signed payload, so it cannot be forged — but a token
  // minted with a ten-year TTL should not be accepted by a route that expects
  // one hour.
  if (expiresAt - now > maxTtl) {
    return false;
  }

  const expectedSignature = sign(
    secret,
    expiresAt,
    random,
    opts.sessionId ?? "",
  );

  return safeEqual(providedSignature, expectedSignature);
}

/**
 * Verifies a state-changing request under the double-submit / synchroniser
 * token pattern.
 *
 * Both tokens must be present, identical, and individually valid. Comparing
 * the two alone is not enough — an attacker who can set a cookie on the origin
 * could otherwise supply a matching pair of their own.
 *
 * @param cookieToken - Token taken from the CSRF cookie.
 * @param requestToken - Token taken from the request header or form field.
 * @param secret - The secret key for verification.
 * @param options - Maximum lifetime and session binding.
 * @returns True when the request carries a matching, valid token.
 */
export function verifyDoubleSubmit(
  cookieToken: string | undefined,
  requestToken: string | undefined,
  secret: string,
  options?: number | CsrfTokenOptions,
): boolean {
  if (!cookieToken || !requestToken) {
    return false;
  }

  if (!safeEqual(cookieToken, requestToken)) {
    return false;
  }

  return validateCsrfToken(cookieToken, secret, options);
}

/**
 * Checks if a request method requires CSRF protection.
 *
 * @param method - The HTTP method.
 * @param config - Optional CSRF configuration.
 * @returns True if CSRF protection is required.
 */
export function requiresCsrfProtection(
  method: string,
  config?: CsrfConfig,
): boolean {
  if (SAFE_METHODS.includes(method.toUpperCase())) {
    return false;
  }

  const methods = config?.methods ?? DEFAULT_METHODS;
  return methods.includes(method.toUpperCase());
}

/**
 * Extracts the CSRF token from request headers.
 *
 * Lookup is case-insensitive: HTTP header names are, and a raw header bag is
 * not guaranteed to arrive lowercased.
 *
 * @param headers - Request headers.
 * @param headerName - The header name to look for.
 * @returns The CSRF token, or undefined.
 */
export function extractCsrfTokenFromHeaders(
  headers: Record<string, string | string[] | undefined>,
  headerName?: string,
): string | undefined {
  const name = (headerName ?? DEFAULT_HEADER_NAME).toLowerCase();

  let value: string | string[] | undefined;
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === name) {
      value = headers[key];
      break;
    }
  }

  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value) && value.length > 0) {
    return value[0];
  }

  return undefined;
}

/**
 * Extracts the CSRF token from cookies.
 *
 * @param cookieHeader - The raw Cookie header.
 * @param cookieName - The cookie name to look for.
 * @returns The CSRF token, or undefined.
 */
export function extractCsrfTokenFromCookies(
  cookieHeader: string,
  cookieName?: string,
): string | undefined {
  const name = cookieName ?? DEFAULT_COOKIE_NAME;

  const cookies = cookieHeader.split(";").map((pair) => {
    const eqIndex = pair.indexOf("=");
    if (eqIndex === -1) return { name: pair.trim(), value: "" };
    return {
      name: pair.slice(0, eqIndex).trim(),
      value: pair.slice(eqIndex + 1).trim(),
    };
  });

  const cookie = cookies.find((c) => c.name === name);
  return cookie?.value || undefined;
}

/**
 * Options for the CSRF cookie.
 *
 * `secret` is deliberately omitted: this function never reads one, and
 * inheriting the whole of {@link CsrfConfig} made a *required* secret part of
 * the declared shape of a call that has no use for it.
 */
export interface CsrfCookieOptions extends Omit<CsrfConfig, "secret"> {
  /**
   * Whether to set `HttpOnly` (default: true).
   *
   * Keep it on for the synchroniser-token pattern, where the server renders
   * the token into the page. Set it to `false` only for the double-submit
   * pattern, where client script must read the cookie back.
   */
  readonly httpOnly?: boolean;
  /**
   * Whether to set `Secure` (default: true).
   *
   * Only turn this off for local development over plain HTTP. Without it the
   * token is readable by anyone on the network path.
   */
  readonly secure?: boolean;
  /** Cookie path (default: "/"). */
  readonly path?: string;
}

/**
 * Generates a Set-Cookie header for a CSRF token.
 *
 * @param token - The CSRF token to store.
 * @param config - Optional CSRF and cookie configuration.
 * @returns The Set-Cookie header value.
 */
export function generateCsrfCookie(
  token: string,
  config?: Partial<CsrfCookieOptions>,
): string {
  const name = config?.cookieName ?? DEFAULT_COOKIE_NAME;
  const ttl = config?.expiration ?? DEFAULT_EXPIRATION;
  const httpOnly = config?.httpOnly ?? true;
  const secure = config?.secure ?? true;
  const path = config?.path ?? "/";

  const parts = [`${name}=${token}`, `Path=${path}`];

  if (httpOnly) {
    parts.push("HttpOnly");
  }

  if (secure) {
    parts.push("Secure");
  }

  parts.push("SameSite=Strict", `Max-Age=${ttl}`);

  return parts.join("; ");
}


/* ─── Bound CSRF protection ──────────────────────────────────────────────── */

/** Cookie-shaping options for {@link createCsrfProtection}. */
export interface CsrfProtectionOptions extends CsrfConfig {
  /** Whether to set `HttpOnly` on the cookie (default: true). */
  readonly httpOnly?: boolean;
  /** Whether to set `Secure` on the cookie (default: true). */
  readonly secure?: boolean;
  /** Cookie path (default: "/"). */
  readonly path?: string;
}

/** A CSRF token together with the `Set-Cookie` header that carries it. */
export interface IssuedCsrfToken {
  /** The token to render into the page or return to the client. */
  readonly token: string;
  /** The `Set-Cookie` header value. */
  readonly setCookie: string;
}

/** The request fields {@link CsrfProtection.verify} needs. */
export interface CsrfVerifiableRequest {
  readonly method: string;
  readonly headers?: Record<string, string | string[] | undefined>;
  /** The raw `Cookie` header value. */
  readonly cookieHeader?: string;
}

/** CSRF protection bound to one configuration. */
export interface CsrfProtection {
  /** Mint a token and the cookie that carries it. */
  issue(options?: { readonly sessionId?: string }): IssuedCsrfToken;
  /**
   * Verify a request under the double-submit pattern.
   *
   * Returns `true` for a method that does not require protection, so it can be
   * called unconditionally.
   */
  verify(
    request: CsrfVerifiableRequest,
    options?: { readonly sessionId?: string },
  ): boolean;
  /** Whether this method requires protection under the configured methods. */
  requiresProtection(method: string): boolean;
}

/**
 * Binds a {@link CsrfConfig} to the CSRF primitives.
 *
 * Every field of `CsrfConfig` was previously inert. `secret` — the one
 * *required* field — was never read by anything: each function took the secret
 * as a positional argument instead. `headerName` was likewise never read, so a
 * caller who configured it still had `x-csrf-token` looked up. Reaching the
 * configured names meant passing them again, by hand, at four separate call
 * sites.
 *
 * This composes the existing functions; it introduces no new token format.
 *
 * @param config - Secret, lifetime, cookie/header names, protected methods.
 * @returns Protection bound to that configuration.
 * @throws {Error} when the secret is missing or shorter than
 *   {@link MIN_CSRF_SECRET_LENGTH}.
 */
export function createCsrfProtection(
  config: CsrfProtectionOptions,
): CsrfProtection {
  assertUsableSecret(config.secret);

  const expiration = config.expiration ?? DEFAULT_EXPIRATION;
  const cookieName = config.cookieName ?? DEFAULT_COOKIE_NAME;
  const headerName = config.headerName ?? DEFAULT_HEADER_NAME;

  return {
    issue(options) {
      const token = generateCsrfToken(config.secret, {
        expiration,
        ...(options?.sessionId !== undefined
          ? { sessionId: options.sessionId }
          : {}),
      });
      return {
        token,
        setCookie: generateCsrfCookie(token, {
          cookieName,
          expiration,
          ...(config.httpOnly !== undefined
            ? { httpOnly: config.httpOnly }
            : {}),
          ...(config.secure !== undefined ? { secure: config.secure } : {}),
          ...(config.path !== undefined ? { path: config.path } : {}),
        }),
      };
    },

    verify(request, options) {
      if (!requiresCsrfProtection(request.method, config)) {
        return true;
      }
      const cookieToken = extractCsrfTokenFromCookies(
        request.cookieHeader ?? "",
        cookieName,
      );
      const requestToken = extractCsrfTokenFromHeaders(
        request.headers ?? {},
        headerName,
      );
      return verifyDoubleSubmit(cookieToken, requestToken, config.secret, {
        expiration,
        ...(options?.sessionId !== undefined
          ? { sessionId: options.sessionId }
          : {}),
      });
    },

    requiresProtection(method) {
      return requiresCsrfProtection(method, config);
    },
  };
}
