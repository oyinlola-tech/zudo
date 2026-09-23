/**
 * @zudojs/testing — Node transport.
 *
 * Sends requests over a real socket with `node:http`/`node:https`. Each
 * request uses its own connection (`agent: false`), so closing the server
 * never waits on a pooled keep-alive socket.
 */

import { request as httpRequest } from "node:http";
import type { IncomingMessage, OutgoingHttpHeaders } from "node:http";
import { request as httpsRequest } from "node:https";

import { NetworkError, TimeoutError, TimeoutOperation } from "@zudojs/errors";

import type {
  HttpTestTransport,
  RawHttpRequest,
  RawHttpResponse,
} from "./httpTestTransport.type.js";

function toOutgoingHeaders(headers: Headers): OutgoingHttpHeaders {
  const outgoing: OutgoingHttpHeaders = {};
  headers.forEach((value, name) => {
    outgoing[name] = value;
  });
  return outgoing;
}

function toHeaders(message: IncomingMessage): Headers {
  const headers = new Headers();
  const raw = message.rawHeaders;
  for (let index = 0; index + 1 < raw.length; index += 2) {
    headers.append(raw[index] as string, raw[index + 1] as string);
  }
  return headers;
}

function collect(message: IncomingMessage): Promise<RawHttpResponse> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    message.on("data", (chunk: Buffer) => chunks.push(chunk));
    message.on("error", reject);
    message.on("end", () => {
      resolve({
        status: message.statusCode ?? 0,
        statusText: message.statusMessage ?? "",
        headers: toHeaders(message),
        body: new Uint8Array(Buffer.concat(chunks)),
      });
    });
  });
}

/**
 * Sends one request to `origin` and resolves with the complete response.
 *
 * Rejects with a `TimeoutError` when no complete response arrives within
 * `request.timeoutMs`, and with a `NetworkError` when the connection fails.
 */
export function sendNodeRequest(
  origin: string,
  request: RawHttpRequest,
): Promise<RawHttpResponse> {
  const url = new URL(request.target, origin);
  const send = url.protocol === "https:" ? httpsRequest : httpRequest;
  const label = `${request.method} ${request.target}`;

  return new Promise((resolve, reject) => {
    const headers = toOutgoingHeaders(request.headers);
    if (request.body !== undefined && headers["content-length"] === undefined) {
      headers["content-length"] = String(request.body.byteLength);
    }
    const outgoing = send(url, {
      method: request.method,
      headers,
      agent: false,
    });

    const timer = setTimeout(() => {
      outgoing.destroy(
        new TimeoutError(`${label} timed out after ${request.timeoutMs} ms.`, {
          operation: TimeoutOperation.REQUEST,
          timeoutMs: request.timeoutMs,
          target: label,
        }),
      );
    }, request.timeoutMs);

    outgoing.on("response", (message) => {
      collect(message)
        .then(resolve, reject)
        .finally(() => clearTimeout(timer));
    });

    outgoing.on("error", (error: Error) => {
      clearTimeout(timer);
      reject(
        error instanceof TimeoutError
          ? error
          : new NetworkError(`${label} failed: ${error.message}`, {
              cause: error,
              endpoint: url.href,
              method: request.method,
            }),
      );
    });

    outgoing.end(
      request.body === undefined ? undefined : Buffer.from(request.body),
    );
  });
}

/** A transport that talks to an already-listening origin and owns nothing. */
export function createOriginTransport(
  origin: string,
  close: () => Promise<void> = async () => undefined,
): HttpTestTransport {
  return {
    origin,
    send: (request) => sendNodeRequest(origin, request),
    close,
  };
}
