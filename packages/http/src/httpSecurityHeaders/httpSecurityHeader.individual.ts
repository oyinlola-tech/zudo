/**
 * Individual security header builders.
 *
 * @module httpSecurityHeaders/individual
 */

import type {
  XFrameOptions,
  ReferrerPolicyValue,
  CrossOriginEmbedderPolicy,
  CrossOriginOpenerPolicy,
  CrossOriginResourcePolicy,
  PermissionsPolicy,
  XPermittedCrossDomainPolicy,
} from "./core/httpSecurityHeader.type.js";

import { createCSP, parseCSP, validateCSP } from "../httpCsp/index.js";
import { createHSTSHeader } from "../httpHsts/index.js";
import { assertSafeHeaderValue } from "../httpHeaders/security/index.js";

/**
 * Creates a Content-Security-Policy header.
 *
 * Delegates to `httpCsp`. This module previously formatted the policy itself
 * with `Object.entries(...).join("; ")`, which applied none of `httpCsp`'s
 * directive-name validation and none of its value checks — so a value
 * containing `;` injected a directive, and a value containing a newline
 * injected a header. There is now one CSP formatter in the package.
 */
export function contentSecurityPolicyHeader(
  directives: string | Record<string, readonly string[]>,
): string {
  if (typeof directives === "string") {
    if (!validateCSP(parseCSP(directives))) {
      throw new TypeError(
        "Invalid Content-Security-Policy: a directive name or value is malformed.",
      );
    }

    assertSafeHeaderValue(directives);

    return directives;
  }

  return createCSP({ directives }).policy;
}

/**
 * Creates a Strict-Transport-Security header.
 *
 * Delegates to `httpHsts`. The previous local implementation accepted any
 * `maxAge` (including a negative or fractional one, which browsers discard,
 * silently leaving the site unprotected) and would happily emit
 * `preload` without `includeSubDomains` or with a `max-age` below the
 * preload-list minimum — a policy the preload list rejects, so the operator
 * believes they are preloaded and are not. `createHSTSHeader` validates all of
 * that.
 */
export function strictTransportSecurityHeader(
  options: {
    readonly maxAge?: number;
    readonly includeSubDomains?: boolean;
    readonly preload?: boolean;
  } = {},
): string {
  return createHSTSHeader(options);
}

/**
 * Creates an X-Content-Type-Options header.
 */
export function xContentTypeOptionsHeader(): string {
  return "nosniff";
}

/**
 * Creates an X-Frame-Options header.
 */
export function xFrameOptionsHeader(option: XFrameOptions = "DENY"): string {
  return option;
}

/**
 * Creates a Referrer-Policy header.
 */
export function referrerPolicyHeader(
  policy: ReferrerPolicyValue = "strict-origin-when-cross-origin",
): string {
  return policy;
}

/**
 * Creates a Permissions-Policy header.
 */
export function permissionsPolicyHeader(policy: PermissionsPolicy): string {
  const parts = Object.entries(policy).map(([feature, value]) => {
    if (!/^[a-z][a-z0-9-]*$/i.test(feature.trim())) {
      throw new TypeError(`Invalid Permissions-Policy feature: ${feature}`);
    }

    const name = feature.trim().toLowerCase();

    if (typeof value === "boolean") {
      return `${name}=${value ? "*" : "()"}`;
    }

    const allowlist = Array.isArray(value) ? value : [value];

    for (const entry of allowlist) {
      assertPermissionsPolicyOrigin(entry);
    }

    return `${name}=(${allowlist.join(" ")})`;
  });

  const header = parts.join(", ");

  assertSafeHeaderValue(header);

  return header;
}

/**
 * A Permissions-Policy allowlist entry is `*`, `self`, `src`, `none`, or a
 * quoted origin. Anything containing a separator would restructure the header.
 */
function assertPermissionsPolicyOrigin(value: string): void {
  const trimmed = value.trim();

  if (
    trimmed === "*" ||
    trimmed === "self" ||
    trimmed === "src" ||
    trimmed === "none"
  ) {
    return;
  }

  if (/^"https?:\/\/[^"\s,;()]+"$/.test(trimmed)) {
    return;
  }

  throw new TypeError(
    `Invalid Permissions-Policy allowlist entry: ${JSON.stringify(value)}. Expected *, self, src, none, or a quoted http(s) origin.`,
  );
}

/**
 * Creates a Cross-Origin-Embedder-Policy header.
 */
export function crossOriginEmbedderPolicyHeader(
  policy: CrossOriginEmbedderPolicy = "require-corp",
): string {
  return policy;
}

/**
 * Creates a Cross-Origin-Opener-Policy header.
 */
export function crossOriginOpenerPolicyHeader(
  policy: CrossOriginOpenerPolicy = "same-origin",
): string {
  return policy;
}

/**
 * Creates a Cross-Origin-Resource-Policy header.
 */
export function crossOriginResourcePolicyHeader(
  policy: CrossOriginResourcePolicy = "same-site",
): string {
  return policy;
}

/**
 * Creates an X-Permitted-Cross-Domain-Policies header.
 */
export function xPermittedCrossDomainPoliciesHeader(
  policy: XPermittedCrossDomainPolicy = "none",
): string {
  return policy;
}
