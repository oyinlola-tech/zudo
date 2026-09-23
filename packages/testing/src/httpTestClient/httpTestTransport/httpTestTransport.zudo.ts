/**
 * @zudojs/testing — `@zudojs/http` transport.
 *
 * `@zudojs/http` has no `handle(Request) => Response` entry point, so its
 * targets are served on an ephemeral port through a real `NodeHttpAdapter`:
 * requests pass the adapter's request guard, body limits, handler and default
 * error mapping exactly as in production. A server or adapter that is already
 * running is used where it listens and left running.
 */

import { createServer } from "node:http";

import { NodeHttpAdapter, createResponseContext } from "@zudojs/http";
import type {
  HttpHandler,
  HttpMiddlewarePipeline,
  HttpRouter,
  HttpServer,
  NodeAdapterOptions,
} from "@zudojs/http";

import type { HttpTestTransport } from "./httpTestTransport.type.js";
import { createOriginTransport } from "./httpTestTransport.node.js";
import {
  createNodeServerTransport,
  formatOrigin,
} from "./httpTestTransport.server.js";

/** Adapter settings for the `NodeHttpAdapter` the client creates. */
export type HttpTestAdapterOptions = Omit<
  NodeAdapterOptions,
  "handler" | "host" | "port" | "server"
>;

/** Serves a (not listening) Node adapter on an ephemeral port. */
function bridge(adapter: NodeHttpAdapter): Promise<HttpTestTransport> {
  return createNodeServerTransport(
    createServer((request, response) => {
      adapter.handle({ request, response }).catch(() => {
        if (!response.writableEnded) {
          response.destroy();
        }
      });
    }),
  );
}

function listeningOrigin(
  address: { readonly host?: string; readonly port?: number } | undefined,
): string | undefined {
  return address?.port === undefined
    ? undefined
    : formatOrigin(address.host ?? "127.0.0.1", address.port);
}

/** Transport for a `NodeHttpAdapter`. */
export function createAdapterTransport(
  adapter: NodeHttpAdapter,
): Promise<HttpTestTransport> {
  const origin = adapter.isStarted
    ? listeningOrigin(adapter.address)
    : undefined;
  return origin
    ? Promise.resolve(createOriginTransport(origin))
    : bridge(adapter);
}

/** Transport for an `HttpServer`. */
export async function createHttpServerTransport(
  server: HttpServer,
): Promise<HttpTestTransport> {
  const running = server.isRunning
    ? listeningOrigin(server.address)
    : undefined;
  if (running) {
    return createOriginTransport(running);
  }
  if (server.adapter instanceof NodeHttpAdapter) {
    return bridge(server.adapter);
  }
  await server.start();
  const origin = listeningOrigin(server.address);
  if (!origin) {
    await server.stop();
    throw new TypeError(
      `createHttpTestClient started HttpServer "${server.name}" but its adapter "${server.adapter.name}" reports no TCP address to send requests to.`,
    );
  }
  return createOriginTransport(origin, async () => {
    await server.stop({ force: true });
  });
}

/** Transport for an `HttpHandler`, served by a fresh `NodeHttpAdapter`. */
export function createHandlerTransport(
  handler: HttpHandler,
  options: HttpTestAdapterOptions = {},
): Promise<HttpTestTransport> {
  return bridge(new NodeHttpAdapter({ ...options, handler }));
}

/** Transport for an `HttpRouter`. */
export function createRouterTransport(
  router: HttpRouter,
  options: HttpTestAdapterOptions = {},
): Promise<HttpTestTransport> {
  return createHandlerTransport(
    async (request) => (await router.dispatch(request)).response,
    options,
  );
}

/** Transport for an `HttpMiddlewarePipeline`. */
export function createPipelineTransport(
  pipeline: HttpMiddlewarePipeline,
  options: HttpTestAdapterOptions = {},
): Promise<HttpTestTransport> {
  return createHandlerTransport(
    (request) => pipeline.execute(request, createResponseContext()),
    options,
  );
}
