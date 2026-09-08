/**
 * Response helper functions.
 *
 * @module httpResponse/helpers
 */

import type {
  ResponseHeaders,
  ResponseCookie,
} from "./core/httpResponse.type.js";

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
      location: url,
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
 * Serializes a response cookie into a Set-Cookie header string.
 */
export function serializeResponseCookie(cookie: ResponseCookie): string {
  let str = `${cookie.name}=${cookie.value}`;

  if (cookie.options) {
    const opts = cookie.options;

    if (opts.domain) {
      str += `; Domain=${opts.domain}`;
    }
    if (opts.path) {
      str += `; Path=${opts.path}`;
    }
    if (opts.expires instanceof Date) {
      str += `; Expires=${opts.expires.toUTCString()}`;
    }
    if (typeof opts.maxAge === "number") {
      str += `; Max-Age=${opts.maxAge}`;
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
  }

  return str;
}
