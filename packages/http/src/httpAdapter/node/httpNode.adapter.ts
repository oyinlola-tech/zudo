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

import type { ResponseContextInit } from "../../httpResponse/core/httpResponse.type.js";

import { BaseHttpAdapter } from "../http.adapter.js";

import type { HttpHandlerResult } from "../http.adapter.js";

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

import { createNodeRequestContext } from "./httpNode.request.js";

import {
  isIncomingMessage,
  isServerResponse,
  isNodeRequestResponsePair,
  configureServer,
  listen,
  closeServer,
  readNodeRequestBody,
  NodeRequestBodyTooLargeError,
  isResponseContextLike,
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

  private readonly maxConnections: number | undefined;

  private readonly connectionsCheckingInterval: number;

  private readonly shutdownGraceMs: number | undefined;

  private readonly events: NodeAdapterEvents;

  private server: Server | undefined;

  private ownsServer = false;

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

    this.events = options.events ?? {};

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

  override createRequest(input: unknown): HttpRequestContext {
    if (!isIncomingMessage(input)) {
      throw new TypeError(
        "NodeHttpAdapter.createRequest expected an IncomingMessage.",
      );
    }

    return createNodeRequestContext(input, {
      maxBodySize: this.maxBodySize,
      trustProxy: this.trustProxy as boolean | string | readonly string[],
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

    const context = this.createRequest(request);

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

  private normalizeResult(result: HttpHandlerResult): HttpResponseContext {
    if (result instanceof HttpResponseContext) {
      return result;
    }

    if (result === undefined || result === null) {
      return createResponseContext();
    }

    if (isResponseContextLike(result)) {
      return createResponseContext(result as ResponseContextInit);
    }

    return createResponseContext().json(result);
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

      await this.writeNodeResponse(
        response,
        context.setStatus(413).json({ error: "Payload Too Large" }),
      );

      return;
    }

    if (this.errorHandler) {
      try {
        const result = await this.errorHandler(error, request);

        const normalized = this.normalizeResult(result);

        await this.writeNodeResponse(response, normalized);

        return;
      } catch {
        // Fall through to the safe internal server error response.
      }
    }

    context.internalServerError().json({
      error: "Internal Server Error",
    });

    await this.writeNodeResponse(response, context);
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

    this.server.on("clientError", (error, socket) => {
      this.emitAdapterError(error);

      if (socket.writable) {
        socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
      }

      socket.destroy();
    });

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

  override async stop(): Promise<void> {
    if (!this.server || !this.server.listening) {
      await super.stop();

      return;
    }

    await closeServer(this.server, { graceMs: this.shutdownGraceMs });

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
