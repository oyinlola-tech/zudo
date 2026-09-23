import { createSerializer } from "@zudojs/serialization";
import type { Serializer } from "@zudojs/serialization";

import type { APIBindingOptions, APIOperationSource } from "../shared/apiBinding.type.js";

import type { APIWireResult } from "../shared/apiWireResult.helper.js";

import { createOperationRunner } from "../shared/apiBinding.helper.js";

import { toApiWireResult } from "../shared/apiWireResult.helper.js";

import { compileRouteTable } from "../route/apiRoute.table.js";

import { APINotFoundError, createAPIError, ErrorCode } from "../../errors/index.js";

import { normalizeRequestId } from "../../context/context.type.js";

import { normalizeAPIError } from "../../executor/executor.core.js";

import { readFetchInput } from "./apiFetch.input.js";

/** Default limit on a request body read by the fetch binding (1 MiB). */
export const DEFAULT_API_MAX_BODY_BYTES = 1024 * 1024;

/**
 * Options for {@link createApiFetchHandler}. `state` receives the
 * `Request` — derive the authenticated principal there.
 */
export interface APIFetchHandlerOptions extends APIBindingOptions<Request> {
  /** Prefix for every route, e.g. `"/api"`. */
  readonly basePath?: string;
  /** Largest JSON request body accepted, in bytes. Defaults to 1 MiB. */
  readonly maxBodyBytes?: number;
  /** Response/request serializer. Defaults to `@zudojs/serialization` JSON. */
  readonly serializer?: Serializer<unknown, string>;
}

const MAX_REFLECTED_PATH = 256;

const FALLBACK_WRITER = createSerializer("json");

/**
 * Exposes operations as a web-standard handler,
 * `(request: Request) => Promise<Response>`, that any Fetch API server
 * (`@zudojs/http`, Bun, Deno, edge runtimes, Node adapters) can mount.
 *
 * Routes come from each operation's `metadata.http` (default
 * `POST /<name>`), input from the query string or JSON body plus path
 * parameters, and every response body is an {@link APIWireResult}:
 * `{ ok: true, data }` with 200, or `{ ok: false, error }` with the error's
 * status (422 validation, 404 unknown route, 405 wrong method, 413/415 bad
 * body, 500 internal). Internal messages and stack traces never reach the
 * response. The call runs under `request.signal`, so a client that
 * disconnects cancels it; the request id comes from `x-request-id` when
 * safe and is echoed back in the same header.
 *
 * @throws {TypeError | RangeError} at creation for invalid or conflicting routes.
 */
export function createApiFetchHandler(
  operations: APIOperationSource,
  options: APIFetchHandlerOptions = {},
): (request: Request) => Promise<Response> {
  const table = compileRouteTable(operations, options.basePath);
  const run = createOperationRunner(options);
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_API_MAX_BODY_BYTES;
  const reader =
    options.serializer ?? createSerializer("json", { maxSize: maxBodyBytes, maxDepth: 64 });
  const writer = options.serializer ?? createSerializer("json");

  const respond = (body: APIWireResult, code: number, requestId: string, extra?: Record<string, string>): Response => {
    let text: string;
    let status = code;
    try {
      text = writer.serialize(body);
    } catch (error) {
      const failure = normalizeAPIError(error, "response serialization");
      options.onInternalError?.(failure, requestId);
      text = FALLBACK_WRITER.serialize(toApiWireResult({ ok: false, error: failure }, requestId));
      status = 500;
    }
    return new Response(text, {
      status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "x-request-id": requestId,
        ...extra,
      },
    });
  };

  const refuse = (error: ReturnType<typeof createAPIError>, requestId: string, extra?: Record<string, string>): Response => {
    const body = toApiWireResult({ ok: false, error }, requestId);
    return respond(body, body.ok ? 200 : body.error.statusCode, requestId, extra);
  };

  return async (request: Request): Promise<Response> => {
    const requestId = normalizeRequestId(request.headers.get("x-request-id") ?? undefined);
    const url = new URL(request.url);
    const match = table.match(request.method, url.pathname);

    if (match.kind === "not-found") {
      const path = url.pathname.slice(0, MAX_REFLECTED_PATH);
      return refuse(new APINotFoundError(path, request.method.slice(0, 16)), requestId);
    }
    if (match.kind === "bad-path") {
      return refuse(clientError(400, "Request path is not correctly encoded."), requestId);
    }
    if (match.kind === "method-not-allowed") {
      const allow = match.allow.join(", ");
      return refuse(clientError(405, `Method not allowed; use ${allow}.`), requestId, { allow });
    }

    const { route, operation } = match.entry;
    const read = await readFetchInput(request, url, route, match.params, reader, maxBodyBytes);
    if (!read.ok) {
      return refuse(read.error, requestId);
    }

    const outcome = await run({
      operation,
      input: read.input,
      source: request,
      transport: "http",
      requestId,
      correlationId: request.headers.get("x-correlation-id") ?? undefined,
      signal: request.signal,
    });

    const body = toApiWireResult(outcome.result, outcome.requestId);
    return respond(body, body.ok ? route.successStatus : body.error.statusCode, outcome.requestId);
  };
}

function clientError(statusCode: number, message: string): ReturnType<typeof createAPIError> {
  return createAPIError(message, { statusCode, code: ErrorCode.API_ERROR, expose: true });
}
