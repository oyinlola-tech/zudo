import type { IncomingMessage, ServerResponse } from "node:http";

import type {
  HTTPContext,
  HTTPHandler,
  HTTPMiddleware,
  HTTPRequest,
  HTTPResponse,
  HTTPRouteMatch,
  HTTPState,
} from "../httpTypes/http.types.js";

import { createHTTPContext } from "../httpContext/http.context.js";

import { createHTTPRequest } from "../httpRequest/http.request.js";

import type { TrustProxy } from "../httpTrustProxy/httpTrustProxy.type.js";

import { createHTTPResponse } from "../httpResponse/http.response.js";

import { createDefaultContextLogger } from "./httpAdapter.logger.js";

/* -------------------------------------------------------------------------- */
/* Adapter Contracts                                                          */
/* -------------------------------------------------------------------------- */

export interface HTTPAdapter<State extends HTTPState = HTTPState> {
  readonly name: string;

  createRequest(request: IncomingMessage): HTTPRequest;

  createResponse(response: ServerResponse): HTTPResponse;

  createContext(
    request: HTTPRequest,
    response: HTTPResponse,
    options?: {
      readonly state?: State;
      readonly signal?: AbortSignal;
    },
  ): HTTPContext<State>;
}

/* -------------------------------------------------------------------------- */
/* Node Adapter                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Options every Node request built by this module accepts.
 *
 * `trustProxy` defaults to `false`, so `X-Forwarded-For` and
 * `X-Forwarded-Proto` are ignored and the socket peer decides `request.ip`,
 * `request.protocol` and `request.secure`.
 */
export interface NodeRequestTrustOptions {
  readonly trustProxy?: TrustProxy;
}

export class NodeHTTPAdapter<
  State extends HTTPState = HTTPState,
> implements HTTPAdapter<State> {
  public readonly name = "node";

  private readonly trustProxy: TrustProxy;

  public constructor(options: NodeRequestTrustOptions = {}) {
    this.trustProxy = options.trustProxy ?? false;
  }

  public createRequest(
    request: IncomingMessage,
    options: NodeRequestTrustOptions = {},
  ): HTTPRequest {
    return createHTTPRequest(request, {
      trustProxy: options.trustProxy ?? this.trustProxy,
    });
  }

  public createResponse(response: ServerResponse): HTTPResponse {
    return createHTTPResponse(response);
  }

  public createContext(
    request: HTTPRequest,
    response: HTTPResponse,
    options: {
      readonly state?: State;
      readonly signal?: AbortSignal;
    } = {},
  ): HTTPContext<State> {
    return createHTTPContext<State>({
      request,
      response,
      state: options.state ?? ({} as State),
      signal: options.signal,
      logger: createDefaultContextLogger(),
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Adapter Options                                                             */
/* -------------------------------------------------------------------------- */

export interface HTTPAdapterOptions<State extends HTTPState = HTTPState> {
  readonly adapter?: HTTPAdapter<State>;
  /**
   * Which socket peers may speak for a client through `X-Forwarded-*`.
   * Defaults to `false` — forwarded headers are ignored.
   */
  readonly trustProxy?: TrustProxy;
}

/* -------------------------------------------------------------------------- */
/* Adapter Factory                                                             */
/* -------------------------------------------------------------------------- */

export function createHTTPAdapter<State extends HTTPState = HTTPState>(
  options: NodeRequestTrustOptions = {},
): NodeHTTPAdapter<State> {
  return new NodeHTTPAdapter<State>(options);
}

/* -------------------------------------------------------------------------- */
/* Request Adapter                                                             */
/* -------------------------------------------------------------------------- */

export interface RequestAdapter {
  toHTTPRequest(request: IncomingMessage): HTTPRequest;
}

export class NodeRequestAdapter implements RequestAdapter {
  private readonly trustProxy: TrustProxy;

  public constructor(options: NodeRequestTrustOptions = {}) {
    this.trustProxy = options.trustProxy ?? false;
  }

  public toHTTPRequest(request: IncomingMessage): HTTPRequest {
    return createHTTPRequest(request, { trustProxy: this.trustProxy });
  }
}

/* -------------------------------------------------------------------------- */
/* Response Adapter                                                            */
/* -------------------------------------------------------------------------- */

export interface ResponseAdapter {
  toHTTPResponse(response: ServerResponse): HTTPResponse;
}

export class NodeResponseAdapter implements ResponseAdapter {
  public toHTTPResponse(response: ServerResponse): HTTPResponse {
    return createHTTPResponse(response);
  }
}

/* -------------------------------------------------------------------------- */
/* Context Adapter                                                             */
/* -------------------------------------------------------------------------- */

export interface ContextAdapter<State extends HTTPState = HTTPState> {
  create(
    request: HTTPRequest,
    response: HTTPResponse,
    options?: {
      readonly state?: State;
      readonly signal?: AbortSignal;
    },
  ): HTTPContext<State>;
}

export class NodeContextAdapter<
  State extends HTTPState = HTTPState,
> implements ContextAdapter<State> {
  public create(
    request: HTTPRequest,
    response: HTTPResponse,
    options: {
      readonly state?: State;
      readonly signal?: AbortSignal;
    } = {},
  ): HTTPContext<State> {
    return createHTTPContext<State>({
      request,
      response,
      state: options.state ?? ({} as State),
      signal: options.signal,
      logger: createDefaultContextLogger(),
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Handler Adapter                                                             */
/* -------------------------------------------------------------------------- */

export interface HTTPHandlerAdapter<State extends HTTPState = HTTPState> {
  handle(
    handler: HTTPHandler<State>,
    context: HTTPContext<State>,
  ): Promise<unknown>;
}

export class DefaultHTTPHandlerAdapter<
  State extends HTTPState = HTTPState,
> implements HTTPHandlerAdapter<State> {
  public async handle(
    handler: HTTPHandler<State>,
    context: HTTPContext<State>,
  ): Promise<unknown> {
    return handler(context);
  }
}

/* -------------------------------------------------------------------------- */
/* Middleware Adapter                                                         */
/* -------------------------------------------------------------------------- */

export interface HTTPMiddlewareAdapter<State extends HTTPState = HTTPState> {
  execute(
    middleware: readonly HTTPMiddleware<State>[],
    context: HTTPContext<State>,
    handler: HTTPHandler<State>,
  ): Promise<void>;
}

export class DefaultHTTPMiddlewareAdapter<
  State extends HTTPState = HTTPState,
> implements HTTPMiddlewareAdapter<State> {
  public async execute(
    middleware: readonly HTTPMiddleware<State>[],
    context: HTTPContext<State>,
    handler: HTTPHandler<State>,
  ): Promise<void> {
    let index = -1;

    const dispatch = async (currentIndex: number): Promise<void> => {
      if (currentIndex <= index) {
        throw new Error("next() called multiple times.");
      }

      index = currentIndex;

      const current = middleware[currentIndex];

      if (!current) {
        await handler(context);

        return;
      }

      await current(context, () => dispatch(currentIndex + 1));
    };

    await dispatch(0);
  }
}

/* -------------------------------------------------------------------------- */
/* Route Adapter                                                               */
/* -------------------------------------------------------------------------- */

export interface HTTPRouteAdapter<State extends HTTPState = HTTPState> {
  match(method: string, path: string): HTTPRouteMatch<State> | undefined;
}

/* -------------------------------------------------------------------------- */
/* Request Conversion Helpers                                                  */
/* -------------------------------------------------------------------------- */

export function adaptNodeRequest(
  request: IncomingMessage,
  options: NodeRequestTrustOptions = {},
): HTTPRequest {
  return createHTTPRequest(request, {
    trustProxy: options.trustProxy ?? false,
  });
}

export function adaptNodeResponse(response: ServerResponse): HTTPResponse {
  return createHTTPResponse(response);
}

export function adaptNodeContext<State extends HTTPState = HTTPState>(
  request: IncomingMessage,
  response: ServerResponse,
  options: {
    readonly state?: State;
    readonly signal?: AbortSignal;
  } = {},
): HTTPContext<State> {
  return createHTTPContext<State>({
    request: adaptNodeRequest(request),
    response: adaptNodeResponse(response),
    state: options.state ?? ({} as State),
    signal: options.signal,
    logger: createDefaultContextLogger(),
  });
}

/* -------------------------------------------------------------------------- */
/* Adapter Detection                                                          */
/* -------------------------------------------------------------------------- */

export function isHTTPAdapter(value: unknown): value is HTTPAdapter {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<HTTPAdapter>;

  return (
    typeof candidate.name === "string" &&
    typeof candidate.createRequest === "function" &&
    typeof candidate.createResponse === "function" &&
    typeof candidate.createContext === "function"
  );
}
