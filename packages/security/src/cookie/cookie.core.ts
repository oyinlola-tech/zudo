/**
 * @zudojs/security — Cookie Security
 *
 * Parses, validates, and serializes HTTP cookies with security best practices.
 */

import type {
  CookieSecurityConfig,
  ParsedCookie,
} from "../types/security.type.js";

/** Maximum cookie header size (4KB). */
const MAX_COOKIE_HEADER_SIZE = 4096;

/** Maximum number of cookies. */
const MAX_COOKIE_COUNT = 50;

/** Maximum individual cookie size. */
const MAX_COOKIE_SIZE = 1024;

/**
 * RFC 6265 cookie-name grammar: a `token` as defined by RFC 9110.
 *
 * Separators (`()<>@,;:\"/[]?={}`), whitespace, and control characters are all
 * excluded — several of them would otherwise let a name close the name/value
 * pair early and inject an attribute.
 */
const COOKIE_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

/**
 * RFC 6265 cookie-octet: US-ASCII excluding controls, whitespace, double
 * quote, comma, semicolon, and backslash.
 */
const COOKIE_VALUE_PATTERN = /^[\x21\x23-\x2B\x2D-\x3A\x3C-\x5B\x5D-\x7E]*$/;

/** Characters that must never reach an attribute value. */
const ATTRIBUTE_UNSAFE = /[;,\r\n\x00]/;

/**
 * Parses a raw cookie header string into individual cookies.
 *
 * @param cookieHeader - The raw Cookie header value.
 * @param config - Optional security configuration.
 * @returns Array of parsed cookies, or error messages.
 */
export function parseCookieHeader(
  cookieHeader: string,
  config?: CookieSecurityConfig,
): { cookies: ParsedCookie[]; errors: string[] } {
  const errors: string[] = [];
  const maxSize = config?.maxSize ?? MAX_COOKIE_SIZE;
  const maxCount = config?.maxCount ?? MAX_COOKIE_COUNT;

  // Check total header size
  if (Buffer.byteLength(cookieHeader, "utf8") > MAX_COOKIE_HEADER_SIZE) {
    errors.push(
      `Cookie header size exceeds maximum ${MAX_COOKIE_HEADER_SIZE} bytes`,
    );
    return { cookies: [], errors };
  }

  // Split by semicolons
  const parts = cookieHeader.split(";");

  if (parts.length > maxCount) {
    errors.push(
      `Too many cookies: ${parts.length} exceeds maximum ${maxCount}`,
    );
  }

  const cookies: ParsedCookie[] = [];

  for (let i = 0; i < Math.min(parts.length, maxCount); i++) {
    const part = parts[i]?.trim();
    if (!part) continue;

    const eqIndex = part.indexOf("=");
    if (eqIndex === -1) {
      errors.push(`Cookie ${i}: missing equals sign in "${part}"`);
      continue;
    }

    const name = part.slice(0, eqIndex).trim();
    const value = part.slice(eqIndex + 1).trim();

    if (name.length === 0) {
      errors.push(`Cookie ${i}: empty cookie name`);
      continue;
    }

    if (Buffer.byteLength(value, "utf8") > maxSize) {
      errors.push(
        `Cookie "${name}" value size exceeds maximum ${maxSize} bytes`,
      );
      continue;
    }

    cookies.push({ name, value });
  }

  return { cookies, errors };
}

/**
 * Serializes a parsed cookie into a Set-Cookie header value.
 *
 * The name, value, and every attribute are validated before being written: a
 * value carrying a CRLF would split the response, and one carrying a `;` would
 * append attributes the caller never asked for. Values are percent-encoded by
 * default so ordinary text (spaces, commas, non-ASCII) round-trips safely
 * through {@link parseCookieHeader}.
 *
 * @param cookie - The cookie to serialize.
 * @param config - Optional security configuration for defaults.
 * @returns The serialized Set-Cookie header value.
 * @throws {Error} when the name, value, or an attribute is unsafe.
 */
export function serializeCookie(
  cookie: ParsedCookie,
  config?: CookieSecurityConfig,
): string {
  const nameError = validateCookieName(cookie.name);
  if (nameError) {
    throw new Error(`Cannot serialize cookie: ${nameError}`);
  }

  // Percent-encode unless the value is already a bare cookie-octet string, so
  // a caller that passes an encoded value does not get it double-encoded.
  const encodedValue = COOKIE_VALUE_PATTERN.test(cookie.value)
    ? cookie.value
    : encodeURIComponent(cookie.value);

  const valueError = validateCookieValue(encodedValue);
  if (valueError) {
    throw new Error(`Cannot serialize cookie "${cookie.name}": ${valueError}`);
  }

  const parts = [`${cookie.name}=${encodedValue}`];

  if (cookie.path) {
    assertSafeAttribute("Path", cookie.path);
    parts.push(`Path=${cookie.path}`);
  }

  if (cookie.domain) {
    assertSafeAttribute("Domain", cookie.domain);
    parts.push(`Domain=${cookie.domain}`);
  }

  if (cookie.maxAge !== undefined) {
    if (!Number.isInteger(cookie.maxAge)) {
      throw new Error(
        `Cannot serialize cookie "${cookie.name}": Max-Age must be an integer, got ${cookie.maxAge}`,
      );
    }
    parts.push(`Max-Age=${cookie.maxAge}`);
  }

  if (cookie.expires) {
    if (Number.isNaN(cookie.expires.getTime())) {
      throw new Error(
        `Cannot serialize cookie "${cookie.name}": Expires is an invalid Date`,
      );
    }
    parts.push(`Expires=${cookie.expires.toUTCString()}`);
  }

  // Apply security defaults from config
  const secure = cookie.secure ?? config?.secure ?? true;
  const sameSite = cookie.sameSite ?? config?.sameSite ?? "lax";

  // SameSite=None is only honoured on a Secure cookie; without it browsers
  // reject the cookie outright, which fails as a silent loss of state.
  if (sameSite === "none" && !secure) {
    throw new Error(
      `Cannot serialize cookie "${cookie.name}": SameSite=None requires the Secure attribute`,
    );
  }

  // Partitioned (CHIPS) likewise requires Secure.
  if (cookie.partitioned && !secure) {
    throw new Error(
      `Cannot serialize cookie "${cookie.name}": Partitioned requires the Secure attribute`,
    );
  }

  if (secure) {
    parts.push("Secure");
  }

  const httpOnly = cookie.httpOnly ?? config?.httpOnly ?? true;
  if (httpOnly) {
    parts.push("HttpOnly");
  }

  parts.push(
    `SameSite=${sameSite.charAt(0).toUpperCase() + sameSite.slice(1)}`,
  );

  if (cookie.partitioned) {
    parts.push("Partitioned");
  }

  return parts.join("; ");
}

/** Throws when an attribute value could terminate the attribute or the header. */
function assertSafeAttribute(attribute: string, value: string): void {
  if (ATTRIBUTE_UNSAFE.test(value)) {
    throw new Error(
      `Cookie ${attribute} contains invalid characters (injection risk): ${JSON.stringify(value)}`,
    );
  }
}

/**
 * Creates a Set-Cookie header value with secure defaults.
 *
 * @param name - Cookie name.
 * @param value - Cookie value.
 * @param options - Optional cookie attributes.
 * @param config - Optional security configuration.
 * @returns The serialized Set-Cookie header value.
 * @throws {Error} when the name, value, or an attribute is unsafe.
 */
export function createSecureCookie(
  name: string,
  value: string,
  options?: Partial<Omit<ParsedCookie, "name" | "value">>,
  config?: CookieSecurityConfig,
): string {
  return serializeCookie({ name, value, ...options }, config);
}

/**
 * Validates a cookie name for safety.
 *
 * @param name - The cookie name to validate.
 * @returns An error message if invalid, or undefined.
 */
export function validateCookieName(name: string): string | undefined {
  if (name.length === 0) {
    return "Cookie name cannot be empty";
  }

  if (name.length > 256) {
    return `Cookie name exceeds maximum length of 256: ${name.length}`;
  }

  // RFC 6265: cookie-name is a token — no separators, whitespace, or controls.
  if (!COOKIE_NAME_PATTERN.test(name)) {
    return `Cookie name contains invalid characters: ${name}`;
  }

  return undefined;
}

/**
 * Validates a cookie value for safety.
 *
 * @param value - The cookie value to validate.
 * @returns An error message if invalid, or undefined.
 */
export function validateCookieValue(value: string): string | undefined {
  // Check for semicolons (used as delimiter)
  if (value.includes(";")) {
    return "Cookie value cannot contain semicolons";
  }

  // Check for control characters, CR and LF included
  if (/[\x00-\x1F\x7F]/.test(value)) {
    return "Cookie value contains control characters";
  }

  // Remaining cookie-octet exclusions: whitespace, quote, comma, backslash.
  if (/[\s",\\]/.test(value)) {
    return "Cookie value contains characters that must be percent-encoded";
  }

  return undefined;
}

/**
 * Strips security-sensitive cookies from a cookie header.
 *
 * Matching is on the whole name and on `name`-prefixed variants (`session`
 * also strips `session_id` and `session-token`), because the sensitive cookie
 * in a real deployment is rarely named exactly `session`.
 *
 * @param cookieHeader - The raw Cookie header.
 * @param sensitiveNames - Names of cookies to strip (case-insensitive).
 * @returns The cleaned cookie header.
 */
export function stripSensitiveCookies(
  cookieHeader: string,
  sensitiveNames: readonly string[] = ["session", "token", "auth", "jwt"],
): string {
  const lowerSensitive = sensitiveNames.map((n) => n.toLowerCase());

  return cookieHeader
    .split(";")
    .map((pair) => pair.trim())
    .filter((pair) => {
      const eqIndex = pair.indexOf("=");
      if (eqIndex === -1) return false;
      const name = pair.slice(0, eqIndex).trim().toLowerCase();
      return !lowerSensitive.some(
        (sensitive) =>
          name === sensitive ||
          name.startsWith(`${sensitive}_`) ||
          name.startsWith(`${sensitive}-`) ||
          name.startsWith(`${sensitive}.`),
      );
    })
    .join("; ");
}
