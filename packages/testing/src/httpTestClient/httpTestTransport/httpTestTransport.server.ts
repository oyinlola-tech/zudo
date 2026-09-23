/**
 * @zudojs/testing — ephemeral Node servers.
 *
 * Starts a Node server on `127.0.0.1:0` (the OS picks a free port) and closes
 * it again, including any open connections, when the client is closed.
 */

import { createServer } from "node:http";
import type { Server as HttpServer } from "node:http";
import type { AddressInfo, Server as NetServer } from "node:net";

import type {
  HttpTestTransport,
  NodeRequestListener,
} from "./httpTestTransport.type.js";
import { createOriginTransport } from "./httpTestTransport.node.js";

function originOf(server: NetServer, secure: boolean): string {
  const address = server.address() as AddressInfo | string | null;
  if (address === null || typeof address === "string") {
    throw new TypeError(
      "createHttpTestClient needs a TCP server; a pipe or unix socket address cannot be requested.",
    );
  }
  return formatOrigin(address.address, address.port, secure);
}

/**
 * Builds a requestable origin from a bound address. A wildcard bind
 * (`0.0.0.0`, `::`) is reached through loopback.
 */
export function formatOrigin(
  host: string,
  port: number,
  secure = false,
): string {
  const reachable =
    host === "0.0.0.0" || host === ""
      ? "127.0.0.1"
      : host === "::"
        ? "::1"
        : host;
  const bracketed = reachable.includes(":") ? `[${reachable}]` : reachable;
  return `${secure ? "https" : "http"}://${bracketed}:${port}`;
}

function isTlsServer(server: NetServer): boolean {
  return typeof (server as { addContext?: unknown }).addContext === "function";
}

function closeNetServer(server: NetServer): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    (server as Partial<HttpServer>).closeAllConnections?.();
  });
}

function listenEphemeral(server: NetServer): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error): void => reject(error);
    server.once("error", onError);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", onError);
      resolve();
    });
  });
}

/**
 * Transport for a Node server. A server that is already listening is used
 * where it is and left running; one that is not is started on an ephemeral
 * port, unref'd so a forgotten `close()` cannot hold the process open, and
 * closed by the transport.
 */
export async function createNodeServerTransport(
  server: NetServer,
): Promise<HttpTestTransport> {
  const secure = isTlsServer(server);
  if (server.listening) {
    return createOriginTransport(originOf(server, secure));
  }
  await listenEphemeral(server);
  server.unref();
  return createOriginTransport(originOf(server, secure), () =>
    closeNetServer(server),
  );
}

/** Transport for a bare `(req, res)` listener, served on an ephemeral port. */
export function createListenerTransport(
  listener: NodeRequestListener,
): Promise<HttpTestTransport> {
  return createNodeServerTransport(
    createServer((request, response) => {
      Promise.resolve()
        .then(() => listener(request, response))
        .catch(() => {
          if (!response.headersSent) {
            response.statusCode = 500;
          }
          response.end();
        });
    }),
  );
}
