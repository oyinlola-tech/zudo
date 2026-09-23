/**
 * @zudojs/testing — sends a built test request and runs its expectations.
 */

import { createHttpTestResponse } from "../httpTestResponse/index.js";
import type {
  HttpTestExpectation,
  HttpTestResponse,
} from "../httpTestResponse/index.js";
import { encodeBody } from "./httpTestRequest.encode.js";
import type {
  HttpTestBody,
  HttpTestRequestContext,
} from "./httpTestRequest.type.js";

/**
 * Largest delay a Node timer honours; anything longer fires after 1 ms, so
 * a generous timeout would otherwise fail every request at once.
 */
const MAX_TIMER_DELAY_MS = 2_147_483_647;

/** An expectation plus where it was registered, for failure stacks. */
export interface RegisteredExpectation {
  readonly check: HttpTestExpectation;
  readonly site: Error;
}

/** Everything a request accumulated before it was sent. */
export interface HttpTestRequestState {
  readonly method: string;
  readonly target: string;
  readonly headers: Headers;
  readonly body: HttpTestBody | undefined;
  readonly hasBody: boolean;
  readonly timeoutMs: number;
  readonly expectations: readonly RegisteredExpectation[];
}

/** Points a failure's stack at the `.expect…()` call that registered it. */
function relocate(error: unknown, site: Error): unknown {
  if (error instanceof Error && site.stack) {
    const frames = site.stack.split("\n").slice(2).join("\n");
    error.stack = `${error.name}: ${error.message}\n${frames}`;
  }
  return error;
}

/**
 * Sends the request, stores returned cookies, then runs each expectation in
 * order.
 */
export async function executeHttpTestRequest(
  context: HttpTestRequestContext,
  state: HttpTestRequestState,
): Promise<HttpTestResponse> {
  const { method, target, headers } = state;
  if (state.hasBody && (method === "GET" || method === "HEAD")) {
    throw new TypeError(
      `${method} ${target}: a ${method} request cannot carry a body.`,
    );
  }
  const encoded = state.hasBody
    ? encodeBody(state.body as HttpTestBody)
    : undefined;
  if (encoded && !headers.has("content-type")) {
    headers.set("content-type", encoded.contentType);
  }
  const transport = await context.transport();
  const sentPath = `${transport.pathPrefix ?? ""}${target}`;
  const cookie = context.jar?.headerFor(sentPath);
  if (cookie !== undefined && !headers.has("cookie"))
    headers.set("cookie", cookie);

  const raw = await transport.send({
    method,
    target,
    headers,
    body: encoded?.bytes,
    timeoutMs: Math.min(state.timeoutMs, MAX_TIMER_DELAY_MS),
  });
  const response = createHttpTestResponse(raw, { method, path: target });
  context.jar?.store(response.setCookies, sentPath);

  for (const { check, site } of state.expectations) {
    try {
      await check(response);
    } catch (error) {
      throw relocate(error, site);
    }
  }
  return response;
}
