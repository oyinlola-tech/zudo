/**
 * @zudojs/testing — supertest-style HTTP test client.
 */

import type { TestHTTPRequest } from "../httpTesting/index.js";
import { createHttpTestCookieJar } from "./httpTestClient.cookieJar.js";
import { resolveHttpTestTransport } from "./httpTestClient.target.js";
import type {
  HttpTestClient,
  HttpTestClientOptions,
  HttpTestTarget,
} from "./httpTestClient.type.js";
import {
  createHttpTestRequest,
  substituteParams,
} from "./httpTestRequest/index.js";
import type {
  HttpTestRequest,
  HttpTestRequestContext,
} from "./httpTestRequest/index.js";
import type { HttpTestTransport } from "./httpTestTransport/index.js";

const DEFAULT_TIMEOUT_MS = 5_000;

function fromBuilt(
  context: HttpTestRequestContext,
  built: TestHTTPRequest,
): HttpTestRequest {
  const request = createHttpTestRequest(
    context,
    built.method,
    substituteParams(built.path, built.params),
  ).query(built.query);
  built.headers.forEach((value, name) => request.set(name, value));
  return built.body === undefined
    ? request
    : request.send(built.body as object);
}

/**
 * Creates an HTTP test client for an app, server, handler or URL.
 *
 * The target is started lazily, on the first request (or `start()`), and
 * whatever the client started is closed by `close()`. Pass `cleanup` to have
 * a cleanup manager call `close()` for you.
 *
 * @example
 * ```ts
 * const client = createHttpTestClient(router, { cleanup });
 *
 * await client.post("/users").send({ name: "Ada" }).expect(201);
 * const response = await client
 *   .get("/users/1")
 *   .expect(200)
 *   .expect("content-type", /json/)
 *   .expectJson({ name: "Ada" });
 * ```
 */
export function createHttpTestClient(
  target: HttpTestTarget,
  options: HttpTestClientOptions = {},
): HttpTestClient {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(timeout) || timeout <= 0) {
    throw new RangeError(
      `createHttpTestClient: timeout must be a positive number; got ${timeout}.`,
    );
  }
  const cookies = createHttpTestCookieJar();
  let starting: Promise<HttpTestTransport> | undefined;
  let closing: Promise<void> | undefined;

  const transport = (): Promise<HttpTestTransport> => {
    if (closing) {
      return Promise.reject(
        new TypeError("This HTTP test client has been closed."),
      );
    }
    starting ??= resolveHttpTestTransport(target, options);
    return starting;
  };

  const context: HttpTestRequestContext = {
    transport,
    jar: options.cookies === false ? undefined : cookies,
    headers: { ...options.headers },
    timeout,
  };

  const request = (
    methodOrRequest: string | TestHTTPRequest,
    path = "/",
  ): HttpTestRequest =>
    typeof methodOrRequest === "string"
      ? createHttpTestRequest(context, methodOrRequest.toUpperCase(), path)
      : fromBuilt(context, methodOrRequest);

  const close = (): Promise<void> => {
    closing ??= (async () => {
      const opened = starting;
      if (opened) await (await opened.catch(() => undefined))?.close();
    })();
    return closing;
  };

  options.cleanup?.register(close, "http-test-client");

  return {
    get: (path) => request("GET", path),
    post: (path) => request("POST", path),
    put: (path) => request("PUT", path),
    patch: (path) => request("PATCH", path),
    delete: (path) => request("DELETE", path),
    head: (path) => request("HEAD", path),
    options: (path) => request("OPTIONS", path),
    request,
    cookies,
    start: async () => (await transport()).origin,
    close,
    get closed() {
      return closing !== undefined;
    },
  };
}
