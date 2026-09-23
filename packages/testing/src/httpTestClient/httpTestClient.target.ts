/**
 * @zudojs/testing — test client target resolution.
 *
 * Works out what kind of thing the client was pointed at and builds the
 * matching transport. `@zudojs/http` objects are recognised by shape as well
 * as by class, so a second copy of the package in `node_modules` still works.
 */

import { Server as NetServer } from "node:net";

import type {
  HttpHandler,
  HttpMiddlewarePipeline,
  HttpRouter,
  HttpServer,
  NodeHttpAdapter,
} from "@zudojs/http";

import type {
  FetchHandler,
  HttpTestTransport,
  NodeRequestListener,
} from "./httpTestTransport/index.js";
import {
  createAdapterTransport,
  createFetchTransport,
  createHandlerTransport,
  createHttpServerTransport,
  createListenerTransport,
  createNodeServerTransport,
  createOriginTransport,
  createPipelineTransport,
  createRouterTransport,
} from "./httpTestTransport/index.js";
import type {
  HttpTestClientOptions,
  HttpTestTarget,
} from "./httpTestClient.type.js";

function hasMethods(value: unknown, ...names: readonly string[]): boolean {
  if (value === null || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return names.every((name) => typeof record[name] === "function");
}

function isHttpServerLike(value: unknown): value is HttpServer {
  return (
    hasMethods(value, "start", "stop", "setHandler") &&
    typeof (value as { adapter?: unknown }).adapter === "object"
  );
}

function isNodeAdapterLike(value: unknown): value is NodeHttpAdapter {
  return (
    hasMethods(value, "handle", "setHandler", "start", "stop") &&
    "httpServer" in (value as object)
  );
}

/** A base URL's path (`http://host/api`) prefixes every request target. */
function createBaseUrlTransport(url: URL): HttpTestTransport {
  const transport = createOriginTransport(url.origin);
  const prefix = url.pathname.replace(/\/+$/, "");
  if (!prefix) return transport;
  return {
    ...transport,
    pathPrefix: prefix,
    send: (request) =>
      transport.send({ ...request, target: `${prefix}${request.target}` }),
  };
}

function resolveFunction(
  target: (...args: never[]) => unknown,
  options: HttpTestClientOptions,
): Promise<HttpTestTransport> {
  const kind = options.kind ?? (target.length >= 2 ? "node" : "fetch");
  switch (kind) {
    case "node":
      return createListenerTransport(target as unknown as NodeRequestListener);
    case "zudo":
      return createHandlerTransport(
        target as unknown as HttpHandler,
        options.adapter,
      );
    default:
      return Promise.resolve(
        createFetchTransport(target as unknown as FetchHandler, options.origin),
      );
  }
}

/**
 * Builds the transport for `target`.
 *
 * @throws TypeError when the target is not a supported kind.
 */
export function resolveHttpTestTransport(
  target: HttpTestTarget,
  options: HttpTestClientOptions = {},
): Promise<HttpTestTransport> {
  if (typeof target === "string" || target instanceof URL) {
    return Promise.resolve(createBaseUrlTransport(new URL(target)));
  }
  if (typeof target === "function") {
    return resolveFunction(target, options);
  }
  if (target instanceof NetServer) {
    return createNodeServerTransport(target);
  }
  if (isHttpServerLike(target)) {
    return createHttpServerTransport(target);
  }
  if (isNodeAdapterLike(target)) {
    return createAdapterTransport(target);
  }
  if (hasMethods(target, "dispatch", "match")) {
    return createRouterTransport(target as HttpRouter, options.adapter);
  }
  if (hasMethods(target, "execute", "use")) {
    return createPipelineTransport(
      target as HttpMiddlewarePipeline,
      options.adapter,
    );
  }
  if (hasMethods(target, "fetch")) {
    const app = target as { readonly fetch: FetchHandler };
    return Promise.resolve(
      createFetchTransport((request) => app.fetch(request), options.origin),
    );
  }
  return Promise.reject(
    new TypeError(
      'createHttpTestClient: unsupported target. Pass a base URL, a Node http.Server, a (req, res) listener, a (request: Request) => Response handler, an object with fetch(), or an @zudojs/http HttpServer, NodeHttpAdapter, HttpRouter, HttpMiddlewarePipeline or handler (with kind: "zudo").',
    ),
  );
}
