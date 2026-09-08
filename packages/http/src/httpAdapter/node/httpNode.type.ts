/**
 * Node.js HTTP adapter types and validation.
 *
 * @module httpAdapter/node/types
 */

import type { Server } from "node:http";

import type { HttpAdapterOptions } from "../http.adapter.js";

import type { TrustProxy } from "../../httpTrustProxy/httpTrustProxy.core.js";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface NodeAdapterOptions extends HttpAdapterOptions {
  readonly host?: string;

  readonly port?: number;

  readonly server?: Server;

  readonly maxBodySize?: number;

  readonly trustProxy?: boolean | number | string | readonly string[];

  readonly requestTimeout?: number;

  readonly headersTimeout?: number;

  readonly keepAliveTimeout?: number;

  readonly connectionTimeout?: number;

  /**
   * Maximum number of concurrent connections the server will accept.
   */
  readonly maxConnections?: number;

  /**
   * How often, in milliseconds, Node sweeps connections for expired
   * header/request timeouts. Node's default is 30000, which means a
   * configured `headersTimeout` can overshoot by up to 30 seconds; the
   * adapter tightens it to the headers timeout unless overridden.
   */
  readonly connectionsCheckingInterval?: number;

  /**
   * Grace period, in milliseconds, granted to in-flight requests during
   * `stop()` before their sockets are destroyed. Defaults to 10000.
   */
  readonly shutdownGraceMs?: number;

  /**
   * Lifecycle listeners invoked by the adapter.
   */
  readonly events?: NodeAdapterEvents;
}

/**
 * Options for creating a Node.js request context.
 */
export interface NodeRequestOptions {
  /**
   * Maximum body size in bytes.
   */
  readonly maxBodySize?: number;

  /**
   * Trust proxy configuration for X-Forwarded-* headers.
   * - false: Never trust (default, most secure)
   * - true: Trust all (only for direct connections)
   * - number: Trust N proxies from the right
   * - string[]: Trust specific IP addresses
   */
  readonly trustProxy?: TrustProxy;
}

export interface NodeServerAddress {
  readonly host: string;

  readonly port: number;

  readonly family: string;
}

export interface NodeAdapterEvents {
  readonly onError?: (error: Error) => void;

  readonly onListening?: (address: NodeServerAddress) => void;

  readonly onClose?: () => void;
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

export const DEFAULT_HOST = "127.0.0.1";

export const DEFAULT_PORT = 3000;

/**
 * Default slowloris-resistant timeouts.
 *
 * Node's own defaults (300s request, 60s headers) are long enough that a
 * handful of connections dribbling a request line can hold server resources
 * for minutes, so the adapter tightens them unless the operator opts out by
 * configuring an explicit value.
 */
export const NODE_DEFAULT_HEADERS_TIMEOUT = 10_000;

export const NODE_DEFAULT_REQUEST_TIMEOUT = 30_000;

export const NODE_DEFAULT_KEEP_ALIVE_TIMEOUT = 5_000;

export const DEFAULT_MAX_BODY_SIZE = 10 * 1024 * 1024;

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

export function validatePort(port: number): number {
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new RangeError(
      "HTTP server port must be an integer between 0 and 65535.",
    );
  }

  return port;
}

export function validateMaxBodySize(size: number): number {
  if (!Number.isSafeInteger(size) || size < 0) {
    throw new RangeError(
      "Maximum request body size must be a non-negative safe integer.",
    );
  }

  return size;
}

export function validateTimeout(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative finite number.`);
  }

  return value;
}
