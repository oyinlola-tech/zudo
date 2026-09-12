/**
 * HTTP runtime adapter contract.
 *
 * The adapter layer keeps Zudojs's HTTP core independent from a concrete
 * runtime such as Node.js, Bun, Deno, or a custom server implementation.
 *
 * An adapter is responsible for translating runtime-native requests and
 * responses into Zudojs's request/response contexts and for invoking the
 * application handler.
 */

import {
  HttpRequestContext,
  createRequestContext,
} from "../httpRequest/httpRequest.context.js";

import type { RequestContextInit } from "../httpRequest/httpRequest.context.js";

import {
  HttpResponseContext,
  createResponseContext,
} from "../httpResponse/httpResponse.context.js";

import type { ResponseContextInit } from "../httpResponse/httpResponse.context.js";

import { writeResponse } from "../httpResponse/httpResponse.writer.js";

import type { HttpResponseWriter } from "../httpResponse/httpResponse.writer.js";

import { resolveErrorResponse } from "./httpAdapter.errorResponse.js";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type HttpAdapterName = string;

export type HttpHandlerResult =
  HttpResponseContext | ResponseContextInit | unknown | void;

export type HttpHandler = (
  request: HttpRequestContext,
) => HttpHandlerResult | Promise<HttpHandlerResult>;

export type HttpErrorHandler = (
  error: unknown,
  request: HttpRequestContext,
) => HttpHandlerResult | Promise<HttpHandlerResult>;

export interface HttpAdapterCapabilities {
  readonly streaming?: boolean;

  readonly websockets?: boolean;

  readonly http2?: boolean;

  readonly http3?: boolean;

  readonly trailers?: boolean;

  readonly abortSignal?: boolean;

  readonly keepAlive?: boolean;

  readonly compression?: boolean;
}

export interface HttpAdapterOptions {
  readonly name?: HttpAdapterName;

  readonly handler?: HttpHandler;

  readonly errorHandler?: HttpErrorHandler;

  readonly capabilities?: HttpAdapterCapabilities;

  readonly trustProxy?: boolean | number | string | readonly string[];

  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface HttpAdapterContext {
  readonly adapter: HttpAdapter;

  readonly request: HttpRequestContext;

  readonly response: HttpResponseContext;
}

export interface HttpAdapter {
  readonly name: HttpAdapterName;

  readonly capabilities: Readonly<HttpAdapterCapabilities>;

  readonly metadata: Readonly<Record<string, unknown>>;

  createRequest(input: unknown): HttpRequestContext;

  createResponse(input?: unknown): HttpResponseContext;

  createWriter(response: unknown): HttpResponseWriter;

  handle(
    input: unknown,
  ): void | Promise<void> | Promise<unknown> | Promise<Response>;

  normalizeRequest?(
    input: unknown,
  ): RequestContextInit | Promise<RequestContextInit>;

  normalizeResponse?(
    input: unknown,
  ): ResponseContextInit | Promise<ResponseContextInit>;

  writeResponse?(
    response: unknown,
    context: HttpResponseContext,
  ): void | Promise<void>;

  /**
   * Installs the application request handler.
   *
   * Optional, but an adapter that stores its handler anywhere other than a
   * public `handler` property MUST implement this — otherwise `HttpServer`
   * has no way to hand the handler over and will refuse to start.
   */
  setHandler?(handler: HttpHandler): void;

  /**
   * Installs the error handler. Same contract as {@link setHandler}.
   */
  setErrorHandler?(handler: HttpErrorHandler): void;

  start?(): void | Promise<void>;

  stop?(): void | Promise<void>;
}

/* -------------------------------------------------------------------------- */
/* Adapter Error                                                              */
/* -------------------------------------------------------------------------- */

import { HttpAdapterError } from "@zudojs/errors";

export { HttpAdapterError };

/* -------------------------------------------------------------------------- */
/* Abstract Adapter                                                           */
/* -------------------------------------------------------------------------- */

export abstract class BaseHttpAdapter implements HttpAdapter {
  readonly name: HttpAdapterName;

  readonly capabilities: Readonly<HttpAdapterCapabilities>;

  readonly metadata: Readonly<Record<string, unknown>>;

  protected handler: HttpHandler | undefined;

  protected errorHandler: HttpErrorHandler | undefined;

  private started = false;

  normalizeRequest?(
    input: unknown,
  ): RequestContextInit | Promise<RequestContextInit>;

  normalizeResponse?(
    input: unknown,
  ): ResponseContextInit | Promise<ResponseContextInit>;

  writeResponse?(
    response: unknown,
    context: HttpResponseContext,
  ): void | Promise<void>;

  constructor(options: HttpAdapterOptions = {}) {
    this.name = options.name ?? this.constructor.name;

    this.capabilities = Object.freeze({
      ...(options.capabilities ?? {}),
    });

    this.metadata = Object.freeze({
      ...(options.metadata ?? {}),
    });

    this.handler = options.handler;

    this.errorHandler = options.errorHandler;
  }

  /**
   * Installs the application request handler.
   */
  setHandler(handler: HttpHandler): void {
    this.handler = handler;
  }

  /**
   * Installs the error handler.
   */
  setErrorHandler(handler: HttpErrorHandler): void {
    this.errorHandler = handler;
  }

  abstract createRequest(input: unknown): HttpRequestContext;

  abstract createResponse(input?: unknown): HttpResponseContext;

  abstract createWriter(response: unknown): HttpResponseWriter;

  async handle(input: unknown): Promise<void> {
    const request = await this.createRequestContext(input);

    const response = this.createResponse();

    try {
      const result = await this.executeHandler(request);

      const context = normalizeHandlerResult(result);

      mergeResponseContext(response, context);

      await this.write(input, response);
    } catch (error) {
      await this.handleError(error, request, input, response);
    }
  }

  protected async createRequestContext(
    input: unknown,
  ): Promise<HttpRequestContext> {
    if (this.normalizeRequest) {
      const normalized = await this.normalizeRequest(input);

      return createRequestContext(normalized);
    }

    return this.createRequest(input);
  }

  protected async executeHandler(
    request: HttpRequestContext,
  ): Promise<HttpHandlerResult> {
    if (!this.handler) {
      throw new HttpAdapterError(
        "No HTTP handler has been configured for this adapter.",
        {
          code: "HTTP_HANDLER_NOT_CONFIGURED",
          adapter: this.name,
        },
      );
    }

    return this.handler(request);
  }

  protected async handleError(
    error: unknown,
    request: HttpRequestContext,
    input: unknown,
    response: HttpResponseContext,
  ): Promise<void> {
    if (this.errorHandler) {
      const result = await this.errorHandler(error, request);

      const context = normalizeHandlerResult(result);

      mergeResponseContext(response, context);
    } else {
      const resolved = resolveErrorResponse(error);

      for (const [name, value] of Object.entries(resolved.headers)) {
        response.setHeader(name, value);
      }

      response.setStatus(resolved.status).json(resolved.body);
    }

    await this.write(input, response);
  }

  protected async write(
    input: unknown,
    context: HttpResponseContext,
  ): Promise<void> {
    if (this.writeResponse) {
      await this.writeResponse(input, context);

      return;
    }

    throw new HttpAdapterError(
      "The HTTP adapter does not implement response writing.",
      {
        code: "HTTP_RESPONSE_WRITER_NOT_IMPLEMENTED",
        adapter: this.name,
      },
    );
  }

  async start(): Promise<void> {
    if (this.started) {
      return;
    }

    this.started = true;
  }

  async stop(): Promise<void> {
    if (!this.started) {
      return;
    }

    this.started = false;
  }

  get isStarted(): boolean {
    return this.started;
  }
}

/* -------------------------------------------------------------------------- */
/* Generic Adapter                                                            */
/* -------------------------------------------------------------------------- */

export interface GenericAdapterOptions extends HttpAdapterOptions {
  readonly requestFactory: (
    input: unknown,
  ) => HttpRequestContext | RequestContextInit;

  readonly responseFactory?: (
    input?: unknown,
  ) => HttpResponseContext | ResponseContextInit;

  readonly writerFactory: (response: unknown) => HttpResponseWriter;

  readonly responseWriter?: (
    response: unknown,
    context: HttpResponseContext,
  ) => void | Promise<void>;
}

export class GenericHttpAdapter extends BaseHttpAdapter {
  private readonly requestFactory: GenericAdapterOptions["requestFactory"];

  private readonly responseFactory: GenericAdapterOptions["responseFactory"];

  private readonly writerFactory: GenericAdapterOptions["writerFactory"];

  private readonly responseWriter: GenericAdapterOptions["responseWriter"];

  constructor(options: GenericAdapterOptions) {
    super(options);

    this.requestFactory = options.requestFactory;

    this.responseFactory = options.responseFactory;

    this.writerFactory = options.writerFactory;

    this.responseWriter = options.responseWriter;
  }

  createRequest(input: unknown): HttpRequestContext {
    const result = this.requestFactory(input);

    if (result instanceof HttpRequestContext) {
      return result;
    }

    return createRequestContext(result);
  }

  createResponse(input?: unknown): HttpResponseContext {
    if (this.responseFactory) {
      const result = this.responseFactory(input);

      if (result instanceof HttpResponseContext) {
        return result;
      }

      return createResponseContext(result);
    }

    return createResponseContext();
  }

  createWriter(response: unknown): HttpResponseWriter {
    return this.writerFactory(response);
  }

  override async writeResponse(
    response: unknown,
    context: HttpResponseContext,
  ): Promise<void> {
    if (this.responseWriter) {
      await this.responseWriter(response, context);

      return;
    }

    const writer = this.createWriter(response);

    await writeResponse(context, writer);
  }
}

/* -------------------------------------------------------------------------- */
/* Adapter Registry                                                           */
/* -------------------------------------------------------------------------- */

export class HttpAdapterRegistry {
  private readonly adapters = new Map<string, HttpAdapter>();

  register(adapter: HttpAdapter): this {
    const name = normalizeAdapterName(adapter.name);

    if (!name) {
      throw new TypeError("HTTP adapter name cannot be empty.");
    }

    if (this.adapters.has(name)) {
      throw new HttpAdapterError(
        `An HTTP adapter named "${adapter.name}" is already registered.`,
        {
          code: "HTTP_ADAPTER_ALREADY_REGISTERED",
          adapter: adapter.name,
        },
      );
    }

    this.adapters.set(name, adapter);

    return this;
  }

  replace(adapter: HttpAdapter): this {
    const name = normalizeAdapterName(adapter.name);

    if (!name) {
      throw new TypeError("HTTP adapter name cannot be empty.");
    }

    this.adapters.set(name, adapter);

    return this;
  }

  unregister(name: string): boolean {
    return this.adapters.delete(normalizeAdapterName(name));
  }

  has(name: string): boolean {
    return this.adapters.has(normalizeAdapterName(name));
  }

  get(name: string): HttpAdapter | undefined {
    return this.adapters.get(normalizeAdapterName(name));
  }

  require(name: string): HttpAdapter {
    const adapter = this.get(name);

    if (!adapter) {
      throw new HttpAdapterError(`HTTP adapter "${name}" is not registered.`, {
        code: "HTTP_ADAPTER_NOT_FOUND",
        adapter: name,
      });
    }

    return adapter;
  }

  list(): readonly HttpAdapter[] {
    return Object.freeze([...this.adapters.values()]);
  }

  clear(): void {
    this.adapters.clear();
  }
}

/* -------------------------------------------------------------------------- */
/* Adapter Lifecycle                                                          */
/* -------------------------------------------------------------------------- */

export async function startAdapter(adapter: HttpAdapter): Promise<void> {
  if (adapter.start) {
    await adapter.start();
  }
}

export async function stopAdapter(adapter: HttpAdapter): Promise<void> {
  if (adapter.stop) {
    await adapter.stop();
  }
}

/* -------------------------------------------------------------------------- */
/* Adapter Assertions                                                         */
/* -------------------------------------------------------------------------- */

export function isHttpAdapter(value: unknown): value is HttpAdapter {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<HttpAdapter>;

  return (
    typeof candidate.name === "string" &&
    typeof candidate.createRequest === "function" &&
    typeof candidate.createResponse === "function" &&
    typeof candidate.createWriter === "function" &&
    typeof candidate.handle === "function"
  );
}

/* -------------------------------------------------------------------------- */
/* Result Normalization                                                       */
/* -------------------------------------------------------------------------- */

export function normalizeHandlerResult(
  result: HttpHandlerResult,
): HttpResponseContext {
  if (result instanceof HttpResponseContext) {
    return result;
  }

  if (result === undefined || result === null) {
    return createResponseContext();
  }

  if (isResponseContextInit(result)) {
    return createResponseContext(result);
  }

  return createResponseContext().json(result);
}

export function isResponseContextInit(
  value: unknown,
): value is ResponseContextInit {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    "status" in candidate ||
    "statusText" in candidate ||
    "headers" in candidate ||
    "body" in candidate ||
    "contentType" in candidate ||
    "contentLength" in candidate ||
    "cookies" in candidate ||
    "metadata" in candidate
  );
}

/* -------------------------------------------------------------------------- */
/* Response Merging                                                           */
/* -------------------------------------------------------------------------- */

export function mergeResponseContext(
  target: HttpResponseContext,
  source: HttpResponseContext,
): HttpResponseContext {
  target.setStatus(source.status, source.statusText);

  for (const [name, value] of Object.entries(source.headers)) {
    /* `ResponseHeaders` allows an explicit `undefined` value, which means the
     * header is absent. Merging one used to call `.join` on it and throw. */
    if (value === undefined) {
      continue;
    }

    target.setHeader(
      name,
      typeof value === "string" ? value : value.join(", "),
    );
  }

  for (const cookie of source.cookies) {
    target.setCookie(cookie);
  }

  for (const [key, value] of Object.entries(source.metadata)) {
    target.setMetadata(key, value);
  }

  if (source.body !== undefined) {
    target.setBody(source.body);
  }

  return target;
}

/* -------------------------------------------------------------------------- */
/* Internal Helpers                                                           */
/* -------------------------------------------------------------------------- */

function normalizeAdapterName(name: string): string {
  return name.trim().toLowerCase();
}
