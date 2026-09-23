/**
 * @zudojs/testing — HTTP test transport types.
 *
 * A transport turns one fully-built request into the bytes the app answered
 * with. Every target kind (URL, Node server, request listener, fetch handler,
 * `@zudojs/http` server/router/adapter) is reduced to one of these.
 */

import type { IncomingMessage, ServerResponse } from "node:http";

/** A request as it goes on the wire. */
export interface RawHttpRequest {
  readonly method: string;
  /** Origin-relative target: path plus query string. */
  readonly target: string;
  readonly headers: Headers;
  readonly body: Uint8Array | undefined;
  readonly timeoutMs: number;
}

/** A response as it came off the wire. */
export interface RawHttpResponse {
  readonly status: number;
  readonly statusText: string;
  readonly headers: Headers;
  readonly body: Uint8Array;
}

/** Sends requests to one target and releases what it opened. */
export interface HttpTestTransport {
  /** Where requests go, e.g. `http://127.0.0.1:41234`. */
  readonly origin: string;
  /**
   * Path prepended to every target before it is sent (`/api` for a base URL
   * of `http://host/api`); the cookie jar scopes cookies by the prefixed
   * path, which is the one the server saw. Absent when there is none.
   */
  readonly pathPrefix?: string;
  readonly send: (request: RawHttpRequest) => Promise<RawHttpResponse>;
  readonly close: () => Promise<void>;
}

/** A web-standard handler: `Request` in, `Response` out. */
export type FetchHandler = (request: Request) => Response | Promise<Response>;

/** An object exposing a web-standard `fetch` method (Hono, Bun-style apps). */
export interface FetchApplication {
  readonly fetch: FetchHandler;
}

/** A Node `http.createServer` request listener. */
export type NodeRequestListener = (
  request: IncomingMessage,
  response: ServerResponse,
) => void | Promise<void>;
