/**
 * @zudojs/testing — HTTP test client types.
 */

import type { Server as NetServer } from "node:net";

import type {
  HttpHandler,
  HttpMiddlewarePipeline,
  HttpRouter,
  HttpServer,
  NodeHttpAdapter,
} from "@zudojs/http";

import type { CleanupManager } from "../cleanupManager/index.js";
import type { TestHTTPRequest } from "../httpTesting/index.js";
import type { HttpTestCookieJar } from "./httpTestClient.cookieJar.js";
import type { HttpTestRequest } from "./httpTestRequest/index.js";
import type {
  FetchApplication,
  FetchHandler,
  HttpTestAdapterOptions,
  NodeRequestListener,
} from "./httpTestTransport/index.js";

/**
 * Anything the test client can send requests to.
 *
 * - a base URL (`"http://127.0.0.1:3000"`, optionally with a path prefix);
 * - a Node `http.Server`/`https.Server` (started on port 0 if not listening);
 * - a Node `(req, res)` request listener;
 * - a web-standard `(request: Request) => Response` handler, or an object with
 *   a `fetch` method — dispatched in-process, no port;
 * - an `@zudojs/http` `HttpServer`, `NodeHttpAdapter`, `HttpRouter`,
 *   `HttpMiddlewarePipeline`, or `HttpHandler` (with `kind: "zudo"`).
 */
export type HttpTestTarget =
  | string
  | URL
  | NetServer
  | NodeRequestListener
  | FetchHandler
  | HttpHandler
  | FetchApplication
  | HttpServer
  | NodeHttpAdapter
  | HttpRouter
  | HttpMiddlewarePipeline;

/**
 * How a function target is called. Functions cannot be told apart reliably,
 * so the default is by arity: two parameters is a Node listener, otherwise a
 * fetch handler. An `@zudojs/http` `HttpHandler` needs `kind: "zudo"`.
 */
export type HttpTestTargetKind = "fetch" | "node" | "zudo";

/** Options for `createHttpTestClient`. */
export interface HttpTestClientOptions {
  /** How to call a function target. See {@link HttpTestTargetKind}. */
  readonly kind?: HttpTestTargetKind;
  /** Per-request timeout in milliseconds. Default 5000. */
  readonly timeout?: number;
  /** Headers sent with every request (a request's own `set()` wins). */
  readonly headers?: Readonly<Record<string, string>>;
  /** Keep cookies from `Set-Cookie` and send them back. Default true. */
  readonly cookies?: boolean;
  /** Registers `client.close()` here, so the cleanup manager releases it. */
  readonly cleanup?: CleanupManager;
  /** Origin fetch-handler requests are resolved against. Default `http://localhost`. */
  readonly origin?: string;
  /** Settings for the `NodeHttpAdapter` created for routers, pipelines and handlers. */
  readonly adapter?: HttpTestAdapterOptions;
}

/**
 * A supertest-style client bound to one target.
 *
 * Servers the client started are closed by `close()`; servers that were
 * already running are left alone.
 */
export interface HttpTestClient {
  readonly get: (path: string) => HttpTestRequest;
  readonly post: (path: string) => HttpTestRequest;
  readonly put: (path: string) => HttpTestRequest;
  readonly patch: (path: string) => HttpTestRequest;
  readonly delete: (path: string) => HttpTestRequest;
  readonly head: (path: string) => HttpTestRequest;
  readonly options: (path: string) => HttpTestRequest;
  /**
   * Starts a request with any method, or sends one built with
   * `createTestHTTPRequest()` / `createHTTPRequest()` (its `:params` are
   * substituted into the path).
   */
  readonly request: (
    methodOrRequest: string | TestHTTPRequest,
    path?: string,
  ) => HttpTestRequest;
  /** Cookies kept across requests. */
  readonly cookies: HttpTestCookieJar;
  /** Starts the target now (otherwise it starts on the first request) and returns its origin. */
  readonly start: () => Promise<string>;
  /** Closes whatever the client started. Safe to call more than once. */
  readonly close: () => Promise<void>;
  readonly closed: boolean;
}
