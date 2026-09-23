/**
 * @zudojs/testing — in-process fetch transport.
 *
 * Calls a web-standard `(Request) => Response` handler directly: no socket,
 * no port. The handler receives an `AbortSignal` that fires on timeout.
 */

import { NetworkError, TimeoutError, TimeoutOperation } from "@zudojs/errors";

import type {
  FetchHandler,
  HttpTestTransport,
  RawHttpRequest,
  RawHttpResponse,
} from "./httpTestTransport.type.js";

const NULL_BODY_STATUSES = new Set([101, 103, 204, 205, 304]);

async function dispatch(
  handler: FetchHandler,
  origin: string,
  raw: RawHttpRequest,
  signal: AbortSignal,
): Promise<RawHttpResponse> {
  const request = new Request(new URL(raw.target, origin), {
    method: raw.method,
    headers: raw.headers,
    body: raw.body === undefined ? null : (raw.body as RequestInit["body"]),
    signal,
  });
  let response: unknown;
  try {
    response = await handler(request);
  } catch (error) {
    throw new NetworkError(
      `${raw.method} ${raw.target} failed: the fetch handler threw instead of returning a Response.`,
      { cause: error, endpoint: request.url, method: raw.method },
    );
  }
  if (!(response instanceof Response)) {
    throw new NetworkError(
      `${raw.method} ${raw.target} failed: the fetch handler returned ${typeof response}, not a Response.`,
      { endpoint: request.url, method: raw.method },
    );
  }
  const empty =
    raw.method === "HEAD" || NULL_BODY_STATUSES.has(response.status);
  return {
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(response.headers),
    body: empty
      ? new Uint8Array()
      : new Uint8Array(await response.arrayBuffer()),
  };
}

/**
 * Transport that dispatches to a fetch handler in-process.
 *
 * @param handler - The web-standard handler.
 * @param origin - Origin the request URL is resolved against.
 */
export function createFetchTransport(
  handler: FetchHandler,
  origin = "http://localhost",
): HttpTestTransport {
  const send = (raw: RawHttpRequest): Promise<RawHttpResponse> => {
    const controller = new AbortController();
    const label = `${raw.method} ${raw.target}`;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        const error = new TimeoutError(
          `${label} timed out after ${raw.timeoutMs} ms.`,
          {
            operation: TimeoutOperation.REQUEST,
            timeoutMs: raw.timeoutMs,
            target: label,
          },
        );
        controller.abort(error);
        reject(error);
      }, raw.timeoutMs);
    });
    return Promise.race([
      dispatch(handler, origin, raw, controller.signal),
      timeout,
    ]).finally(() => clearTimeout(timer));
  };
  return { origin, send, close: async () => undefined };
}
