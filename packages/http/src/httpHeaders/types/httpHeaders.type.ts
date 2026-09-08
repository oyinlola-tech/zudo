/**
 * Types and interfaces for HTTP header utilities.
 *
 * @module httpHeaders/type
 */

import type { IncomingHttpHeaders, OutgoingHttpHeaders } from "node:http";

import type { HTTPHeaders, HTTPHeadersInit } from "../http.headers.js";

/**
 * A union of all supported header input formats.
 */
export type HTTPHeadersLike =
  | HTTPHeaders
  | HTTPHeadersInit
  | IncomingHttpHeaders
  | OutgoingHttpHeaders
  | Headers;

/**
 * Options for header matching operations.
 */
export interface HeaderMatchOptions {
  readonly caseSensitive?: boolean;
  readonly trim?: boolean;
}
