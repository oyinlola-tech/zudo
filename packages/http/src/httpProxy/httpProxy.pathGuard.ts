/**
 * Proxy request-path containment.
 *
 * A gateway mounts an upstream under `target.pathname` (for example
 * `/public-api`) to expose only that subtree. The path builders used to
 * concatenate the client's path onto the base and collapse `//` only, so
 * `/../admin/keys` or `/%2e%2e/admin/keys` was forwarded as
 * `/public-api/../admin/keys`, which the upstream resolves to `/admin/keys`.
 *
 * @module httpProxy/pathGuard
 */

import { badRequest } from "../httpErrors/factories/httpError.clientError.js";

const ENCODED_SEPARATORS = /%2e|%2f|%5c/gi;

function decodeSeparator(match: string): string {
  const code = match.toLowerCase();

  if (code === "%2e") {
    return ".";
  }

  return code === "%2f" ? "/" : "\\";
}

/**
 * Whether a request path contains a `.` / `..` segment once percent-encoded
 * dots and separators (`%2e`, `%2f`, `%5c`) and backslashes are taken into
 * account, i.e. whether an upstream might resolve it outside its base.
 */
export function hasProxyDotSegment(path: string): boolean {
  const end = path.search(/[?#]/);

  const pathOnly = end === -1 ? path : path.slice(0, end);

  const decoded = pathOnly.replace(ENCODED_SEPARATORS, decodeSeparator);

  return decoded
    .split(/[\\/]/)
    .some((segment) => segment === "." || segment === "..");
}

/**
 * Throws a `400 Bad Request` `HttpError` when the client-supplied path could
 * escape the proxy target's base path.
 */
export function assertProxyPathContained(path: string): void {
  if (hasProxyDotSegment(path)) {
    throw badRequest("Proxy request path contains a dot segment.");
  }
}
