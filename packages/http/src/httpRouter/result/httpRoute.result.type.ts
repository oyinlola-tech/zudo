/**
 * Zudojs HTTP route result types and constants.
 */

import type {
  HttpMethod,
  MatchedRoute,
} from "../core/types/httpRouter.type.js";

import type { HttpRequestContext as RequestContext } from "../../httpRequest/httpRequest.context.js";

import type { HttpResponseContext as ResponseContext } from "../../httpResponse/httpResponse.context.js";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type RouteResultBody =
  | string
  | Uint8Array
  | ArrayBuffer
  | ReadableStream<Uint8Array>
  | Record<string, unknown>
  | readonly unknown[]
  | null;

export type RouteResultValue =
  | void
  | null
  | string
  | number
  | boolean
  | bigint
  | Uint8Array
  | ArrayBuffer
  | ReadableStream<Uint8Array>
  | Record<string, unknown>
  | readonly unknown[]
  | RouteResult;

export interface RouteResultInit {
  readonly status?: number;

  readonly statusText?: string;

  readonly headers?: HeadersInit;

  readonly body?: RouteResultBody;

  readonly contentType?: string;

  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface RouteResult {
  readonly status: number;

  readonly statusText: string | undefined;

  readonly headers: Readonly<Record<string, string>>;

  readonly body: RouteResultBody;

  readonly contentType: string | undefined;

  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface RouteResultContext {
  readonly request: RequestContext;

  readonly response: ResponseContext;

  readonly route: MatchedRoute;

  readonly method: HttpMethod | "*";

  readonly path: string;

  readonly params: Readonly<Record<string, string>>;
}

export interface RouteResultOptions {
  readonly defaultStatus?: number;

  readonly defaultContentType?: string;

  readonly serializeJson?: boolean;

  readonly headOnly?: boolean;
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

export const DEFAULT_ROUTE_STATUS = 200;

export const DEFAULT_CONTENT_TYPE = "application/json; charset=utf-8";
