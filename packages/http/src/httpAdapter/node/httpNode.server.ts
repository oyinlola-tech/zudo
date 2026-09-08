/**
 * Node.js HTTP server lifecycle, body reading, and utilities.
 *
 * @module httpAdapter/node/server
 */

import { IncomingMessage, Server, ServerResponse } from "node:http";

import { validateTimeout, validateMaxBodySize } from "./httpNode.type.js";

import { DEFAULT_MAX_BODY_SIZE } from "./httpNode.type.js";

/* -------------------------------------------------------------------------- */
/* Type Guards                                                                */
/* -------------------------------------------------------------------------- */

export function isIncomingMessage(value: unknown): value is IncomingMessage {
  return value instanceof IncomingMessage;
}

export function isServerResponse(value: unknown): value is ServerResponse {
  return value instanceof ServerResponse;
}

export function isNodeRequestResponsePair(value: unknown): value is {
  readonly request: IncomingMessage;

  readonly response: ServerResponse;
} {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const pair = value as {
    request?: unknown;
    response?: unknown;
  };

  return isIncomingMessage(pair.request) && isServerResponse(pair.response);
}

/* -------------------------------------------------------------------------- */
/* Server Configuration                                                       */
/* -------------------------------------------------------------------------- */

export function configureServer(
  server: Server,
  options: {
    readonly requestTimeout?: number;
    readonly headersTimeout?: number;
    readonly keepAliveTimeout?: number;
    readonly connectionTimeout?: number;
    readonly maxConnections?: number;
  },
): void {
  if (options.requestTimeout !== undefined) {
    server.requestTimeout = validateTimeout(
      options.requestTimeout,
      "requestTimeout",
    );
  }

  if (options.headersTimeout !== undefined) {
    server.headersTimeout = validateTimeout(
      options.headersTimeout,
      "headersTimeout",
    );
  }

  if (options.keepAliveTimeout !== undefined) {
    server.keepAliveTimeout = validateTimeout(
      options.keepAliveTimeout,
      "keepAliveTimeout",
    );
  }

  if (options.connectionTimeout !== undefined) {
    server.timeout = validateTimeout(
      options.connectionTimeout,
      "connectionTimeout",
    );
  }

  if (options.maxConnections !== undefined) {
    if (
      !Number.isInteger(options.maxConnections) ||
      options.maxConnections < 1
    ) {
      throw new RangeError("maxConnections must be a positive integer.");
    }

    server.maxConnections = options.maxConnections;
  }
}

/* -------------------------------------------------------------------------- */
/* Listen / Close                                                             */
/* -------------------------------------------------------------------------- */

export function listen(
  server: Server,
  port: number,
  host: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    const onListening = () => {
      cleanup();
      resolve();
    };

    const cleanup = () => {
      server.off("error", onError);

      server.off("listening", onListening);
    };

    server.once("error", onError);

    server.once("listening", onListening);

    server.listen(port, host);
  });
}

/**
 * Closes a listening server.
 *
 * `server.close()` on its own stops accepting new connections but waits
 * indefinitely for every existing socket to end, including idle keep-alive
 * sockets that no request is using. Idle sockets are therefore closed
 * immediately, and after `graceMs` any connection still in flight is closed
 * too so shutdown cannot be held open by a client.
 *
 * @param server - The server to close.
 * @param options - `graceMs` is how long in-flight requests are given before
 *   their sockets are destroyed. `0` closes everything immediately;
 *   `Infinity` waits forever (the old behaviour).
 */
export function closeServer(
  server: Server,
  options: { readonly graceMs?: number } = {},
): Promise<void> {
  if (!server.listening) {
    return Promise.resolve();
  }

  const graceMs = options.graceMs ?? 10_000;

  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    server.close((error) => {
      if (timer !== undefined) {
        clearTimeout(timer);
      }

      if (error) {
        reject(error);

        return;
      }

      resolve();
    });

    /* Idle keep-alive sockets are never going to end on their own. */
    server.closeIdleConnections();

    if (Number.isFinite(graceMs)) {
      timer = setTimeout(
        () => {
          server.closeAllConnections();
        },
        Math.max(0, graceMs),
      );

      timer.unref?.();
    }
  });
}

/* -------------------------------------------------------------------------- */
/* Header Helpers                                                             */
/* -------------------------------------------------------------------------- */

export function getHeader(
  request: IncomingMessage,
  name: string,
): string | undefined {
  const value = request.headers[name.toLowerCase()];

  if (Array.isArray(value)) {
    return value.join(", ");
  }

  return value;
}

/* -------------------------------------------------------------------------- */
/* URL Helpers                                                                */
/* -------------------------------------------------------------------------- */

export function removePort(host: string): string {
  if (host.startsWith("[")) {
    const closing = host.indexOf("]", 1);

    if (closing !== -1) {
      return host.slice(1, closing);
    }

    return host;
  }

  const separator = host.lastIndexOf(":");

  if (separator > -1 && host.indexOf(":") === separator) {
    return host.slice(0, separator);
  }

  return host;
}

export function extractPort(host: string): number | undefined {
  if (host.startsWith("[")) {
    const closing = host.indexOf("]", 1);

    if (closing === -1) {
      return undefined;
    }

    const suffix = host.slice(closing + 1);

    if (!suffix.startsWith(":")) {
      return undefined;
    }

    return parsePort(suffix.slice(1));
  }

  const separator = host.lastIndexOf(":");

  if (separator === -1 || host.indexOf(":") !== separator) {
    return undefined;
  }

  return parsePort(host.slice(separator + 1));
}

export function parsePort(value: string): number | undefined {
  if (!/^\d+$/.test(value)) {
    return undefined;
  }

  const port = Number(value);

  return Number.isInteger(port) && port >= 1 && port <= 65535
    ? port
    : undefined;
}

export function getSearchPart(url: string): string {
  const index = url.indexOf("?");

  if (index === -1) {
    return "";
  }

  return url.slice(index + 1);
}

/* -------------------------------------------------------------------------- */
/* Body Errors                                                                */
/* -------------------------------------------------------------------------- */

import { RequestBodyTooLargeError as NodeRequestBodyTooLargeError } from "@zudojs/errors";

export { NodeRequestBodyTooLargeError };

/* -------------------------------------------------------------------------- */
/* Body Reader                                                                */
/* -------------------------------------------------------------------------- */

export function readNodeRequestBody(
  request: IncomingMessage,
  maxBodySize = DEFAULT_MAX_BODY_SIZE,
): Promise<Uint8Array> {
  const limit = validateMaxBodySize(maxBodySize);

  const declaredLength = getHeader(request, "content-length");

  if (declaredLength) {
    const length = Number(declaredLength);

    if (Number.isFinite(length) && length > limit) {
      /*
       * Pause rather than destroy: the caller still needs a live socket to
       * answer with 413. Destroying here makes the client see a dropped
       * connection instead of the status.
       */
      request.pause();

      return Promise.reject(new NodeRequestBodyTooLargeError(limit, length));
    }
  }

  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];

    let total = 0;

    let settled = false;

    const cleanup = () => {
      request.off("data", onData);

      request.off("end", onEnd);

      request.off("error", onError);

      request.off("aborted", onAborted);
    };

    const fail = (error: Error) => {
      if (settled) {
        return;
      }

      settled = true;

      cleanup();
      reject(error);
    };

    const onData = (chunk: Buffer) => {
      const data = new Uint8Array(chunk);

      total += data.byteLength;

      if (total > limit) {
        request.pause();

        fail(new NodeRequestBodyTooLargeError(limit, total));

        return;
      }

      chunks.push(data);
    };

    const onEnd = () => {
      if (settled) {
        return;
      }

      settled = true;

      cleanup();

      const result = new Uint8Array(total);

      let offset = 0;

      for (const chunk of chunks) {
        result.set(chunk, offset);

        offset += chunk.byteLength;
      }

      resolve(result);
    };

    const onError = (error: Error) => {
      fail(error);
    };

    const onAborted = () => {
      fail(
        new Error(
          "The HTTP request was aborted while reading the request body.",
        ),
      );
    };

    request.on("data", onData);

    request.once("end", onEnd);

    request.once("error", onError);

    request.once("aborted", onAborted);
  });
}

/* -------------------------------------------------------------------------- */
/* Response Result Detection                                                  */
/* -------------------------------------------------------------------------- */

export function isResponseContextLike(value: unknown): value is {
  readonly status?: number;

  readonly statusText?: string;

  readonly headers?: Readonly<Record<string, string>>;

  readonly body?: unknown;

  readonly contentType?: string;

  readonly contentLength?: number;

  readonly cookies?: readonly never[];

  readonly metadata?: Readonly<Record<string, unknown>>;
} {
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
