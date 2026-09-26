/**
 * Node.js HTTP adapter.
 *
 * Bridges Node's `http` / `https` server APIs with Zudojs's runtime
 * independent HTTP adapter contract.
 *
 * @module httpAdapter/node/adapter
 */

import {
  IncomingMessage,
  Server,
  ServerResponse,
  createServer,
} from "node:http";

import { HttpRequestContext } from "../../httpRequest/httpRequest.context.js";

import {
  HttpResponseContext,
  createResponseContext,
} from "../../httpResponse/httpResponse.context.js";

import { BaseHttpAdapter, normalizeHandlerResult } from "../http.adapter.js";

import type {
  HttpAdapterStopOptions,
  HttpHandlerResult,
} from "../http.adapter.js";

import type { HttpResponseWriter } from "../../httpResponse/httpResponse.writer.js";

import { writeResponse } from "../../httpResponse/httpResponse.writer.js";

import type {
  NodeAdapterOptions,
  NodeServerAddress,
  NodeAdapterEvents,
} from "./httpNode.type.js";

import {
  DEFAULT_HOST,
  DEFAULT_PORT,
  DEFAULT_MAX_BODY_SIZE,
  NODE_DEFAULT_HEADERS_TIMEOUT,
  NODE_DEFAULT_REQUEST_TIMEOUT,
  NODE_DEFAULT_KEEP_ALIVE_TIMEOUT,
  validatePort,
  validateMaxBodySize,
} from "./httpNode.type.js";

import { NodeResponseWriter } from "./httpNode.response.js";

import { compileTrustProxy } from "../../httpTrustProxy/httpTrustProxy.compilation.js";

import { createNodeRequestGuard, type NodeRequestGuard } from "../../httpSecurity/httpSecurity.nodeGuard.js";

import { createNodeRequestContext } from "./httpNode.request.js";

import {
  finalizeErrorResponse,
  resolveErrorResponse,
} from "../errorResponse/index.js";

import { getStatusText } from "../../httpResponse/core/httpResponse.statusText.js";

import { statusName } from "../../httpStatus/httpStatus.name.js";

import {
  isIncomingMessage,
  isServerResponse,
  isNodeRequestResponsePair,
  configureServer,
  listen,
  closeServer,
  readNodeRequestBody,
  NodeRequestBodyTooLargeError,
} from "./httpNode.server.js";

/* -------------------------------------------------------------------------- */
/* Node HTTP Adapter                                                          */
/* -------------------------------------------------------------------------- */

export class NodeHttpAdapter extends BaseHttpAdapter {
  private readonly host: string;

  private readonly port: number;

  private readonly maxBodySize: number;

  private readonly requestTimeout: number | undefined;

  private readonly headersTimeout: number | undefined;

  private readonly keepAliveTimeout: number | undefined;

  private readonly connectionTimeout: number | undefined;

  private readonly trustProxy:
    boolean | number | string | readonly string[] | undefined;

  private readonly trustRequestId: boolean;

  private readonly maxConnections: number | undefined;

  private readonly connectionsCheckingInterval: number;

  private readonly shutdownGraceMs: number | undefined;

  private readonly events: NodeAdapterEvents;

  private readonly requestGuard: NodeRequestGuard | undefined;

  private server: Server | undefined;

  private ownsServer = false;

  /**
   * The `clientError` listener installed by `start()`, kept so `stop()` can
   * remove it. On an externally supplied server the instance survives a
   * stop/start cycle, and re-adding the listener on every start leaked one
   * per restart.
   */
  private clientErrorListener:
    | ((error: Error, socket: import("node:net").Socket) => void)
    | undefined;

  constructor(options: NodeAdapterOptions = {}) {
    super({
      ...options,
      name: options.name ?? "node",
      capabilities: {
        streaming: true,
        websockets: false,
        http2: false,
        http3: false,
        trailers: true,
        abortSignal: true,
        keepAlive: true,
        compression: false,
        ...options.capabilities,
      },
    });

    this.host = options.host ?? DEFAULT_HOST;

    this.port = validatePort(options.port ?? DEFAULT_PORT);

    this.maxBodySize = validateMaxBodySize(
      options.maxBodySize ?? DEFAULT_MAX_BODY_SIZE,
    );

    this.requestTimeout =
      options.requestTimeout ?? NODE_DEFAULT_REQUEST_TIMEOUT;

    this.headersTimeout =
      options.headersTimeout ?? NODE_DEFAULT_HEADERS_TIMEOUT;

    this.keepAliveTimeout =
      options.keepAliveTimeout ?? NODE_DEFAULT_KEEP_ALIVE_TIMEOUT;

    this.connectionTimeout = options.connectionTimeout;

    this.maxConnections = options.maxConnections;

    this.connectionsCheckingInterval =
      options.connectionsCheckingInterval ??
      Math.min(30_000, this.headersTimeout);

    this.shutdownGraceMs = options.shutdownGraceMs;

    this.trustProxy = options.trustProxy;

    this.trustRequestId = options.trustRequestId ?? true;

    if (options.trustProxy !== undefined) {
      compileTrustProxy(options.trustProxy);
    }

    this.events = options.events ?? {};

    this.requestGuard = createNodeRequestGuard(options.security);

    this.server = options.server;

    this.ownsServer = !options.server;
  }

  /* ------------------------------------------------------------------------ */
  /* Server                                                                   */
  /* ------------------------------------------------------------------------ */

  get httpServer(): Server | undefined {
    return this.server;
  }

  get address(): NodeServerAddress | undefined {
    if (!this.server) {
      return undefined;
    }

    const address = this.server.address();

    if (!address || typeof address === "string") {
      return undefined;
    }

    return {
      host: address.address,
      port: address.port,
      family:
        typeof address.family === "string"
          ? address.family
          : String(address.family),
    };
  }

  /* ------------------------------------------------------------------------ */
  /* Request / Response                                                       */
  /* ------------------------------------------------------------------------ */

  override createRequest(
    input: unknown,
    signal?: AbortSignal,
  ): HttpRequestContext {
    if (!isIncomingMessage(input)) {
      throw new TypeError(
        "NodeHttpAdapter.createRequest expected an IncomingMessage.",
      );
    }

    return createNodeRequestContext(input, {
      maxBodySize: this.maxBodySize,
      trustProxy: this.trustProxy,
      trustRequestId: this.trustRequestId,
      signal,
    });
  }

  override createResponse(input?: unknown): HttpResponseContext {
    if (input !== undefined && !isServerResponse(input)) {
      throw new TypeError(
        "NodeHttpAdapter.createResponse expected a ServerResponse.",
      );
    }

    return createResponseContext();
  }

  override createWriter(response: unknown): HttpResponseWriter {
    if (!isServerResponse(response)) {
      throw new TypeError(
        "NodeHttpAdapter.createWriter expected a ServerResponse.",
      );
    }

    return new NodeResponseWriter(response);
  }

  /* ------------------------------------------------------------------------ */
  /* Handle                                                                   */
  /* ------------------------------------------------------------------------ */

  override async handle(input: unknown): Promise<void> {
    if (!isNodeRequestResponsePair(input)) {
      throw new TypeError(
        "NodeHttpAdapter.handle expects a Node HTTP request/response pair.",
      );
    }

    const request = input.request;

    const response = input.response;

    const verdict = this.requestGuard?.(request);

    if (verdict && !verdict.allowed) {
      await this.writeRejection(response, verdict.statusCode);

      return;
    }

    let context: HttpRequestContext;

    const disconnect = new AbortController();

    /*
     * `close` before the response finished means the client went away.
     * Handlers see it as `request.signal` / the router's `ctx.signal`, and a
     * streamed response body stops being pulled.
     */
    response.once("close", () => {
      if (!response.writableFinished) {
        disconnect.abort();
      }
    });

    try {
      context = this.createRequest(request, disconnect.signal);
    } catch (error) {
      /*
       * The request could not even be described (an unparseable request
       * target, a header the context refuses). It is the client's fault, so
       * answer 400 rather than letting the rejection destroy the socket
       * without a response.
       */
      this.emitAdapterError(error);

      /*
       * An error that names its own status — the query parser's 414 — keeps
       * it; anything else (an unparseable target) is the client's fault and
       * gets a 400.
       */
      const resolved = resolveErrorResponse(error);

      if (resolved.status !== 500) {
        await this.writeRejection(response, resolved.status, resolved.body, error);
      } else {
        await this.writeRejection(response, 400);
      }

      return;
    }

    try {
      await this.attachNodeBody(request, context);

      const result = await this.executeNodeHandler(context);

      const responseContext = this.normalizeResult(result);

      await this.writeNodeResponse(response, responseContext);
    } catch (error) {
      await this.handleNodeError(error, context, response);
    }
  }

  /**
   * Reads the request body (subject to `maxBodySize`) and attaches it to the
   * context.
   *
   * Without this the adapter hands handlers a context with no body at all, and
   * the configured `maxBodySize` limit is never applied to anything.
   */
  private async attachNodeBody(
    request: IncomingMessage,
    context: HttpRequestContext,
  ): Promise<void> {
    const method = (request.method ?? "GET").toUpperCase();

    if (method === "GET" || method === "HEAD") {
      return;
    }

    const hasLength = request.headers["content-length"] !== undefined;

    const hasEncoding = request.headers["transfer-encoding"] !== undefined;

    if (!hasLength && !hasEncoding) {
      return;
    }

    const body = await readNodeRequestBody(request, this.maxBodySize);

    context.setBody(body);
  }

  private async executeNodeHandler(
    request: HttpRequestContext,
  ): Promise<HttpHandlerResult> {
    if (!this.handler) {
      throw new Error("No HTTP handler has been configured.");
    }

    return this.handler(request);
  }

  /**
   * Plain objects are data and are sent as JSON; see
   * `normalizeHandlerResult`.
   */
  private normalizeResult(result: HttpHandlerResult): HttpResponseContext {
    return normalizeHandlerResult(result);
  }

  private async handleNodeError(
    error: unknown,
    request: HttpRequestContext,
    response: ServerResponse,
  ): Promise<void> {
    if (response.headersSent) {
      response.destroy(error instanceof Error ? error : undefined);

      return;
    }

    const context = createResponseContext();

    if (error instanceof NodeRequestBodyTooLargeError) {
      /*
       * The request body was never drained, so this connection cannot be
       * safely reused for a following request.
       */
      context.setHeader("connection", "close");

      context.setStatus(413).json({
        error: "Payload Too Large",
        code: "PAYLOAD_TOO_LARGE",
      });

      await this.writeNodeResponse(
        response,
        finalizeErrorResponse(context, this.securityHeaders),
      );

      return;
    }

    if (this.errorHandler) {
      try {
        const result = await this.errorHandler(error, request);

        const normalized = this.normalizeResult(result);

        await this.writeNodeResponse(
          response,
          finalizeErrorResponse(normalized, this.securityHeaders, error),
        );

        return;
      } catch {
        // Fall through to the safe internal server error response.
      }
    }

    /*
     * A thrown `HttpError` (or one buried under the middleware pipeline's
     * wrappers) is answered with its own status, exposed message and headers;
     * anything else stays a generic 500.
     */
    const resolved = resolveErrorResponse(error);

    for (const [name, value] of Object.entries(resolved.headers)) {
      context.setHeader(name, value);
    }

    context.setStatus(resolved.status).json(resolved.body);

    await this.writeNodeResponse(
      response,
      finalizeErrorResponse(context, this.securityHeaders),
    );
  }

  /**
   * Answers a request the adapter refuses before any handler runs (the
   * request guard, an undescribable request). The connection is closed
   * because the body was never read.
   */
  private async writeRejection(
    response: ServerResponse,
    status: number,
    body?: Readonly<Record<string, unknown>>,
    error?: unknown,
  ): Promise<void> {
    if (response.headersSent) {
      response.destroy();

      return;
    }

    const context = createResponseContext();

    context.setHeader("connection", "close");

    context.setStatus(status).json(
      body ?? { error: getStatusText(status), code: statusName(status) },
    );

    await this.writeNodeResponse(
      response,
      finalizeErrorResponse(context, this.securityHeaders, error),
    );
  }

  private async writeNodeResponse(
    response: ServerResponse,
    context: HttpResponseContext,
  ): Promise<void> {
    const writer = this.createWriter(response);

    await writeResponse(context, writer);

    if (!response.writableEnded) {
      writer.end();
    }
  }

  /**
   * Runs `handle` for a Node request/response pair without ever letting the
   * resulting promise reject.
   *
   * `createServer`'s callback is synchronous, so a rejection from `handle`
   * would otherwise escape as an unhandled rejection and terminate the
   * process under Node's default `--unhandled-rejections=throw`.
   */
  private dispatchNodeRequest(
    request: IncomingMessage,
    response: ServerResponse,
  ): void {
    this.handle({ request, response }).catch((error: unknown) => {
      this.emitAdapterError(error);

      if (!response.writableEnded) {
        response.destroy(error instanceof Error ? error : undefined);
      }
    });
  }

  private emitAdapterError(error: unknown): void {
    const listener = this.events.onError;

    if (typeof listener !== "function") {
      return;
    }

    try {
      listener(error instanceof Error ? error : new Error(String(error)));
    } catch {
      /*
       * A failing error listener must not itself escape and re-trigger the
       * unhandled-rejection path this method exists to close.
       */
    }
  }

  override async start(): Promise<void> {
    if (this.server?.listening) {
      return;
    }

    if (!this.server) {
      this.server = createServer(
        { connectionsCheckingInterval: this.connectionsCheckingInterval },
        (request, response) => {
          this.dispatchNodeRequest(request, response);
        },
      );

      this.ownsServer = true;
    } else {
      this.server.removeAllListeners("request");

      this.server.on("request", (request, response) => {
        this.dispatchNodeRequest(request, response);
      });
    }

    configureServer(this.server, {
      requestTimeout: this.requestTimeout,
      headersTimeout: this.headersTimeout,
      keepAliveTimeout: this.keepAliveTimeout,
      connectionTimeout: this.connectionTimeout,
      maxConnections: this.maxConnections,
    });

    if (this.clientErrorListener) {
      this.server.off("clientError", this.clientErrorListener);
    }

    this.clientErrorListener = (error, socket) => {
      this.emitAdapterError(error);

      if (socket.writable) {
        socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
      }

      socket.destroy();
    };

    this.server.on("clientError", this.clientErrorListener);

    await listen(this.server, this.port, this.host);

    const address = this.address;

    if (address && this.events.onListening) {
      try {
        this.events.onListening(address);
      } catch {
        /* A listener failure must not abort a successful start. */
      }
    }

    await super.start();
  }

  /**
   * Closes the server. The grace period is `options.graceMs` (the server's
   * `gracefulShutdownTimeout`), capped by an explicit `shutdownGraceMs`;
   * with neither it is 10 s.
   */
  override async stop(options: HttpAdapterStopOptions = {}): Promise<void> {
    if (!this.server || !this.server.listening) {
      await super.stop();

      return;
    }

    const graceMs =
      options.graceMs === undefined
        ? this.shutdownGraceMs
        : Math.min(options.graceMs, this.shutdownGraceMs ?? Infinity);

    await closeServer(this.server, { graceMs });

    if (this.clientErrorListener) {
      this.server.off("clientError", this.clientErrorListener);

      this.clientErrorListener = undefined;
    }

    if (this.ownsServer) {
      this.server = undefined;
    }

    if (this.events.onClose) {
      try {
        this.events.onClose();
      } catch {
        /* A listener failure must not turn a clean stop into a failure. */
      }
    }

    await super.stop();
  }
}

/* -------------------------------------------------------------------------- */
/* Factory                                                                    */
/* -------------------------------------------------------------------------- */

export function createNodeHttpAdapter(
  options: NodeAdapterOptions = {},
): NodeHttpAdapter {
  return new NodeHttpAdapter(options);
}
