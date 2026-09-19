/**
 * Request guard wiring for the Node adapter.
 *
 * `guardRequest` (Host, request-ID, header-count, header-size, URL/query
 * length and `Transfer-Encoding`/`Content-Length` checks) had no call site,
 * so every one of those checks was inert unless an application wired it by
 * hand. The Node adapter now runs it on every request before the request
 * context is built or the body is read, and answers `400` when it refuses.
 *
 * @module httpSecurity/nodeGuard
 */

import type { IncomingMessage } from "node:http";

import type { HTTPSecurityConfig } from "./httpSecurity.config.js";

import {
  guardRequest,
  type GuardResult,
} from "./httpSecurity.guard.js";

/**
 * The adapter's `security` option.
 *
 * - `true` / omitted (default): run the guard with its defaults.
 * - an object: run the guard with that configuration.
 * - `false`: do not run the guard.
 */
export type NodeAdapterSecurityOption = boolean | Partial<HTTPSecurityConfig>;

/**
 * Adapter options contributed by the request guard.
 */
export interface NodeAdapterSecurityOptions {
  /**
   * Request guard applied before dispatch (on by default). See
   * {@link NodeAdapterSecurityOption}.
   *
   * The guard's `maxBodySize` defaults to "no limit" here so the adapter's own
   * `maxBodySize` keeps answering oversized bodies with `413`; set it
   * explicitly to have the guard refuse a too-large `Content-Length` with
   * `400` before any body is read. `requireHost` defaults to `true` except for
   * HTTP/1.0 requests, where Host is optional.
   */
  readonly security?: NodeAdapterSecurityOption;
}

/**
 * A per-request guard for Node requests.
 */
export type NodeRequestGuard = (request: IncomingMessage) => GuardResult;

/**
 * Builds the guard the adapter runs on each request, or `undefined` when the
 * guard is disabled with `security: false`.
 */
export function createNodeRequestGuard(
  option: NodeAdapterSecurityOption | undefined,
): NodeRequestGuard | undefined {
  if (option === false) {
    return undefined;
  }

  const configured = typeof option === "object" ? option : {};

  return (request) =>
    guardRequest(
      {
        method: request.method ?? "GET",
        url: request.url ?? "/",
        headers: request.headers,
      },
      {
        maxBodySize: Number.MAX_SAFE_INTEGER,
        requireHost: request.httpVersion !== "1.0",
        ...configured,
      },
    );
}
