/**
 * Login identifier normalization.
 *
 * @module authUtils/authUtils.identifier
 */

import { isEmail } from "@zudojs/types";

/**
 * Normalize a login identifier the way `login()` does before looking the
 * user up: Unicode-compatibility fold (NFKC) and trim, then lower-case the
 * whole identifier when it is an email address. A username keeps its case.
 *
 * Store identifiers through this same function at registration, so
 * `" Alice@Example.com"` at sign-in finds the account registered as
 * `alice@example.com`. The lockout counters are keyed case-insensitively
 * independently of this, so case variants never get their own attempt
 * budget either way.
 *
 * @param identifier - The identifier as submitted.
 * @returns The normalized identifier.
 */
export function normalizeLoginIdentifier(identifier: string): string {
  const trimmed = String(identifier).normalize("NFKC").trim();
  return isEmail(trimmed) ? trimmed.toLowerCase() : trimmed;
}
