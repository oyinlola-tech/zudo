/**
 * @zudojs/adapters/http
 *
 * HTTP adapter contracts — request/response translation and server lifecycle.
 */

import type { Adapter, AdapterCapabilities } from "../index.js";

/**
 * Minimal HTTP request shape.
 *
 * Concrete adapters map platform-specific requests to this shape.
 * The actual Zudojs HTTPRequest lives in @zudojs/http.
 */
export interface HTTPRequestLike {
  readonly method: string;
  readonly url: string;
  readonly path: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly query: Readonly<Record<string, unknown>>;
  readonly params: Readonly<Record<string, string>>;
  readonly body?: unknown;
  readonly rawBody?: Uint8Array;
  readonly protocol: string;
  readonly hostname: string;
  readonly ip?: string;
  readonly secure: boolean;
  readonly aborted: boolean;
}

/**
 * Minimal HTTP response shape.
 */
export interface HTTPResponseLike {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: unknown;
}

/**
 * HTTP adapter — translates platform HTTP requests/responses.
 */
export interface HTTPAdapter extends Adapter {
  /** Creates a normalized request from platform-specific input. */
  createRequest(input: unknown): HTTPRequestLike;

  /** Creates a normalized response from platform-specific output. */
  createResponse(input?: unknown): HTTPResponseLike;

  /** Handles an incoming platform request. */
  handle(input: unknown): Promise<void>;

  /** Starts the HTTP server/listener. */
  listen?(options?: HTTPListenOptions): Promise<void>;

  /** Stops the HTTP server/listener. */
  close?(): Promise<void>;
}

/**
 * Options for listening on an HTTP adapter.
 */
export interface HTTPListenOptions {
  /** Hostname to bind to. */
  readonly host?: string;

  /** Port to bind to. */
  readonly port?: number;

  /** TLS configuration. */
  readonly tls?: unknown;
}

/**
 * Request adapter — translates a single platform request.
 */
export interface HTTPRequestAdapter {
  readonly name: string;
  readonly capabilities: AdapterCapabilities;

  adaptRequest(input: unknown): HTTPRequestLike;
}

/**
 * Response adapter — translates a Zudojs response to platform output.
 */
export interface HTTPResponseAdapter {
  readonly name: string;
  readonly capabilities: AdapterCapabilities;

  adaptResponse(
    response: HTTPResponseLike,
    target: unknown,
  ): Promise<void> | void;
}

/**
 * Server adapter — manages HTTP server lifecycle.
 */
export interface HTTPServerAdapter extends Adapter {
  listen(options?: HTTPListenOptions): Promise<void>;
  close(): Promise<void>;
}
