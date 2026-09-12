/**
 * Response helper functions.
 *
 * @module httpResponse/helpers
 */

import type {
  ResponseHeaders,
  ResponseCookie,
} from "./core/httpResponse.type.js";

import { assertSafeRedirect } from "../httpRedirect/http.redirect.js";

/**
 * Creates a JSON response.
 */
export function jsonResponse(
  data: unknown,
  status = 200,
  headers: ResponseHeaders = {},
): {
  readonly status: number;
  readonly headers: ResponseHeaders;
  readonly body: string;
} {
  return {
    status,
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(data),
  };
}

/**
 * Creates a text response.
 */
export function textResponse(
  text: string,
  status = 200,
  headers: ResponseHeaders = {},
): {
  readonly status: number;
  readonly headers: ResponseHeaders;
  readonly body: string;
} {
  return {
    status,
    headers: {
      "content-type": "text/plain",
      ...headers,
    },
    body: text,
  };
}

/**
 * Creates an HTML response.
 */
export function htmlResponse(
  html: string,
  status = 200,
  headers: ResponseHeaders = {},
): {
  readonly status: number;
  readonly headers: ResponseHeaders;
  readonly body: string;
} {
  return {
    status,
    headers: {
      "content-type": "text/html",
      ...headers,
    },
    body: html,
  };
}

/**
 * Creates a redirect response.
 *
 * The destination goes through {@link assertSafeRedirect}: a `javascript:` or
 * `data:` URL, a scheme-relative `//evil.com`, or a value carrying a control
 * character throws instead of being emitted as `Location`.
 *
 * @throws {TypeError} If the destination is not a safe redirect target.
 */
export function redirectResponse(
  url: string,
  status = 302,
  headers: ResponseHeaders = {},
): {
  readonly status: number;
  readonly headers: ResponseHeaders;
  readonly body: undefined;
} {
  return {
    status,
    headers: {
      location: assertSafeRedirect(url),
      ...headers,
    },
    body: undefined,
  };
}

/**
 * Creates an empty response.
 */
export function emptyResponse(
  status = 204,
  headers: ResponseHeaders = {},
): {
  readonly status: number;
  readonly headers: ResponseHeaders;
  readonly body: undefined;
} {
  return {
    status,
    headers,
    body: undefined,
  };
}

/**
 * RFC 6265 `cookie-name`, which is an RFC 9110 `token`.
 */
const COOKIE_NAME_TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

/**
 * RFC 6265 `cookie-octet`: printable US-ASCII minus CTLs, SP, DQUOTE, comma,
 * semicolon and backslash.
 */
const COOKIE_OCTETS = /^[\u0021\u0023-\u002b\u002d-\u003a\u003c-\u005b\u005d-\u007e]*$/;

/**
 * Characters that must never appear in a cookie attribute value: `;` starts
 * the next attribute, and any control character can split the header.
 */
const COOKIE_ATTRIBUTE_FORBIDDEN = /[;\u0000-\u001f\u007f]/;

/**
 * Serializes a response cookie into a Set-Cookie header string.
 *
 * This is the serializer the adapters use for `response.cookie()` and it
 * previously concatenated every field verbatim, so a value such as
 * `x; Domain=evil.com` became a second attribute and a `__Host-` cookie
 * missing `Secure` was emitted (and silently dropped by the browser). It now
 * applies the same rules as `serializeCookie()` in the cookies module:
 *
 * - the name must be an RFC 6265 token;
 * - `__Host-` / `__Secure-` prefix constraints are enforced;
 * - `Domain` and `Path` may not contain `;` or a control character;
 * - a value that is not made only of `cookie-octet` characters is
 *   percent-encoded, so it can neither inject an attribute nor split the
 *   header (a value that is already valid is emitted unchanged);
 * - `maxAge` must be finite and `expires` must be a valid `Date`.
 *
 * @throws {TypeError} If the name, a prefix rule or an attribute is invalid.
 */
export function serializeResponseCookie(cookie: ResponseCookie): string {
  const name = cookie.name;

  if (!name || !COOKIE_NAME_TOKEN.test(name)) {
    throw new TypeError(`Invalid cookie name: ${JSON.stringify(name)}`);
  }

  const opts = cookie.options ?? {};

  if (name.startsWith("__Host-")) {
    if (!opts.secure) {
      throw new TypeError("A __Host- cookie requires the Secure attribute.");
    }

    if (opts.domain) {
      throw new TypeError("A __Host- cookie must not set a Domain attribute.");
    }

    if ((opts.path ?? "/") !== "/") {
      throw new TypeError("A __Host- cookie requires Path=/.");
    }
  } else if (name.startsWith("__Secure-") && !opts.secure) {
    throw new TypeError("A __Secure- cookie requires the Secure attribute.");
  }

  const rawValue = String(cookie.value);

  const value = COOKIE_OCTETS.test(rawValue)
    ? rawValue
    : encodeURIComponent(rawValue);

  let str = `${name}=${value}`;

  if (opts.domain) {
    if (COOKIE_ATTRIBUTE_FORBIDDEN.test(opts.domain)) {
      throw new TypeError("Invalid cookie domain.");
    }

    str += `; Domain=${opts.domain}`;
  }

  if (opts.path) {
    if (COOKIE_ATTRIBUTE_FORBIDDEN.test(opts.path)) {
      throw new TypeError("Invalid cookie path.");
    }

    str += `; Path=${opts.path}`;
  }

  if (opts.expires instanceof Date) {
    if (Number.isNaN(opts.expires.getTime())) {
      throw new TypeError("Cookie expires must be a valid Date.");
    }

    str += `; Expires=${opts.expires.toUTCString()}`;
  }

  if (typeof opts.maxAge === "number") {
    if (!Number.isFinite(opts.maxAge)) {
      throw new TypeError("Cookie maxAge must be a finite number.");
    }

    str += `; Max-Age=${Math.floor(opts.maxAge)}`;
  }

  if (opts.httpOnly) {
    str += "; HttpOnly";
  }

  if (opts.secure) {
    str += "; Secure";
  }

  if (opts.sameSite) {
    str += `; SameSite=${opts.sameSite}`;
  }

  if (opts.priority) {
    str += `; Priority=${opts.priority}`;
  }

  if (opts.partitioned) {
    str += "; Partitioned";
  }

  return str;
}
