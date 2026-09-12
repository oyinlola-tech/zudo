/**
 * HTTP client execution with retry.
 *
 * @module httpClient/executor
 */

import type {
  HttpClientRequestContext,
  HttpClientResponse,
} from "./httpClient.type.js";

import { HttpClientError, HttpClientTimeoutError } from "./httpClient.error.js";

import { normalizeClientError } from "./httpClient.errorNormalizer.js";

import {
  normalizeRetryOptions,
  shouldRetryStatus,
  shouldRetryError,
  calculateRetryDelay,
  delay,
} from "./httpClient.retry.js";

import { combineAbortSignals } from "./httpClient.abort.js";

import { parseResponse } from "./httpClient.response.js";

interface HttpClientLike {
  readonly fetchImpl: typeof globalThis.fetch;
  readonly defaultRetry:
    import("./httpClient.type.js").HttpRetryOptions | undefined;
  readonly defaultTimeout: number | undefined;
}

export async function executeWithRetry(
  context: HttpClientRequestContext,
  client: HttpClientLike,
): Promise<HttpClientResponse> {
  const retry = normalizeRetryOptions(
    context.config.retry ?? client.defaultRetry,
  );
  const retries = retry?.retries ?? 0;
  let attempt = 0;

  while (true) {
    try {
      const response = await executeOnce(context, client);

      if (
        retry !== undefined &&
        attempt < retries &&
        shouldRetryStatus(
          response.status,
          (context.config.method ??
            "GET") as import("./httpClient.type.js").HttpClientMethod,
          retry,
        )
      ) {
        await delay(calculateRetryDelay(attempt, retry));
        attempt += 1;
        continue;
      }

      if (!response.ok) {
        throw new HttpClientError(
          `HTTP request failed with status ${response.status}.`,
          {
            code: "HTTP_CLIENT_HTTP_ERROR",
            status: response.status,
            statusText: response.statusText,
            url: response.url,
            response,
            request: response.request,
          },
        );
      }

      return response;
    } catch (error) {
      const normalized = normalizeClientError(error, context.request);

      if (
        retry !== undefined &&
        attempt < retries &&
        shouldRetryError(
          normalized,
          (context.config.method ??
            "GET") as import("./httpClient.type.js").HttpClientMethod,
          retry,
        )
      ) {
        await delay(calculateRetryDelay(attempt, retry));
        attempt += 1;
        continue;
      }

      throw normalized;
    }
  }
}

async function executeOnce(
  context: HttpClientRequestContext,
  client: HttpClientLike,
): Promise<HttpClientResponse> {
  const timeout = context.config.timeout ?? client.defaultTimeout;
  let controller: AbortController | undefined;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  if (timeout !== undefined) {
    controller = new AbortController();
    timeoutId = setTimeout(() => {
      controller?.abort(new HttpClientTimeoutError(timeout, context.request));
    }, timeout);
  }

  const signal = combineAbortSignals(context.config.signal, controller?.signal);

  /*
   * A `Request` body can be dispatched once. Every attempt used to be built
   * from `context.request` itself, which consumed its body on the first try
   * and made the first *retry* of any body-bearing request fail with
   * "Request object that has already been used" — so `retryMethods: ["POST"]`
   * could never retry. Each attempt now works on a clone, and the original
   * is left untouched for the next one.
   */
  const attemptRequest =
    context.request.body !== null && !context.request.bodyUsed
      ? context.request.clone()
      : context.request;

  const request =
    signal === attemptRequest.signal
      ? attemptRequest
      : new Request(attemptRequest, { signal });

  try {
    const raw = await fetchFollowingRedirects(request, client);
    const response = await parseResponse(
      raw,
      context.config.responseType ?? "auto",
    );
    return response;
  } catch (error) {
    if (error instanceof HttpClientError) {
      throw error;
    }

    throw normalizeClientError(error, request);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Redirects                                                                  */
/* -------------------------------------------------------------------------- */

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

const MAX_REDIRECTS = 20;

/**
 * Headers that authenticate the caller and must never be replayed to an
 * origin the caller did not choose.
 */
const CREDENTIAL_HEADERS = [
  "authorization",
  "cookie",
  "proxy-authorization",
] as const;

/**
 * Follows redirects manually so credentials can be dropped on a cross-origin
 * hop.
 *
 * `fetch`'s own `redirect: "follow"` replays every request header — including
 * `Authorization` — to whatever origin the `Location` header names, so an
 * open redirect on the target host leaks the caller's bearer token to an
 * attacker-chosen server. Following the chain here lets those headers be
 * stripped the moment the origin changes.
 */
async function fetchFollowingRedirects(
  request: Request,
  client: HttpClientLike,
): Promise<Response> {
  if (request.redirect !== "follow") {
    return client.fetchImpl(request);
  }

  const hasBody = request.method !== "GET" && request.method !== "HEAD";

  /*
   * Buffer the body once. A Request's body stream is consumed by the first
   * dispatch, so each hop (and each retry) needs its own copy.
   */
  const body = hasBody ? await request.clone().arrayBuffer() : undefined;

  let current = new Request(request, { redirect: "manual" });

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await client.fetchImpl(current);

    if (!REDIRECT_STATUSES.has(response.status)) {
      return response;
    }

    const location = response.headers.get("location");

    if (!location) {
      return response;
    }

    let target: URL;

    try {
      target = new URL(location, current.url);
    } catch {
      return response;
    }

    if (target.protocol !== "http:" && target.protocol !== "https:") {
      throw new HttpClientError(
        `Refusing to follow a redirect to a non-HTTP scheme: ${target.protocol}`,
        { code: "HTTP_CLIENT_UNSAFE_REDIRECT", url: target.toString() },
      );
    }

    const headers = new Headers(current.headers);

    if (target.origin !== new URL(current.url).origin) {
      for (const name of CREDENTIAL_HEADERS) {
        headers.delete(name);
      }
    }

    let method = current.method;

    let nextBody: ArrayBuffer | undefined = body;

    const dropsBody =
      response.status === 303 ||
      ((response.status === 301 || response.status === 302) &&
        method !== "GET" &&
        method !== "HEAD");

    if (dropsBody) {
      method = method === "HEAD" ? "HEAD" : "GET";
      nextBody = undefined;
      headers.delete("content-length");
      headers.delete("content-type");
    }

    current = new Request(target.toString(), {
      method,
      headers,
      body: nextBody,
      signal: current.signal,
      redirect: "manual",
      credentials: current.credentials,
      integrity: current.integrity,
      referrerPolicy: current.referrerPolicy,
    });
  }

  throw new HttpClientError(
    `HTTP request exceeded the maximum of ${MAX_REDIRECTS} redirects.`,
    { code: "HTTP_CLIENT_TOO_MANY_REDIRECTS", url: current.url },
  );
}
