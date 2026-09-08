/**
 * Zudojs HTTP server types.
 *
 * @module httpServer/types
 */

import {
  HttpServerLifecycleError as HttpServerError,
  InvalidHttpServerStateError,
  HttpServerStartError,
  HttpServerStopError,
} from "@zudojs/errors";

import type {
  HttpAdapter,
  HttpHandler,
  HttpErrorHandler,
} from "../../httpAdapter/http.adapter.js";

export type HttpServerState =
  "created" | "starting" | "running" | "stopping" | "stopped" | "failed";

export interface HttpServerAddress {
  readonly protocol?: string;

  readonly host?: string;

  readonly port?: number;

  readonly path?: string;
}

/**
 * Options accepted by `HttpServer`.
 *
 * This deliberately does NOT extend `HttpAdapterOptions`. Doing so advertised
 * `port`, `host`, `trustProxy` and `capabilities` on the server while the
 * constructor read none of them, so `createHttpServer({ trustProxy: [...] })`
 * compiled and silently ran with no proxy trust. Adapter-level settings
 * belong on the adapter that is passed in.
 */
export interface HttpServerOptions {
  readonly adapter: HttpAdapter;

  readonly name?: string;

  readonly handler?: HttpHandler;

  readonly errorHandler?: HttpErrorHandler;

  readonly gracefulShutdownTimeout?: number;

  /**
   * Lifecycle listeners registered before the server starts. Further
   * listeners can be added at any time with `on()`.
   */
  readonly events?: HttpServerEvents;

  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface HttpServerEvents {
  readonly onStarting?: (server: unknown) => void;

  readonly onStarted?: (server: unknown) => void;

  readonly onStopping?: (server: unknown) => void;

  readonly onStopped?: (server: unknown) => void;

  readonly onError?: (error: unknown, server: unknown) => void;

  readonly onRequest?: (server: unknown) => void;

  readonly onResponse?: (server: unknown) => void;
}

export interface HttpServerSnapshot {
  readonly name: string;

  readonly state: HttpServerState;

  readonly adapter: string;

  readonly address: HttpServerAddress | undefined;

  readonly startedAt: Date | undefined;

  readonly stoppedAt: Date | undefined;

  readonly uptime: number;

  readonly requests: number;

  readonly metadata: Readonly<Record<string, unknown>>;
}

export {
  HttpServerError,
  InvalidHttpServerStateError,
  HttpServerStartError,
  HttpServerStopError,
};
