/**
 * The cookie jar must scope cookies by the path the server actually saw,
 * which includes a base URL's path prefix.
 */

import { createServer } from "node:http";
import type { Server } from "node:http";

import { afterEach, describe, it } from "vitest";

import { createHttpTestClient } from "../../src/httpTestClient/index.js";
import type { HttpTestClient } from "../../src/httpTestClient/index.js";

const clients: HttpTestClient[] = [];
const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  await Promise.all(
    servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
});

async function listen(): Promise<string> {
  const server = createServer((request, response) => {
    if (request.url === "/api/auth/login") {
      response.setHeader("set-cookie", [
        "sid=abc; Path=/api; HttpOnly",
        "scoped=1",
        "admin=1; Path=/admin",
      ]);
    }
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ cookie: request.headers.cookie ?? null }));
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { readonly port: number };
  return `http://127.0.0.1:${port}/api`;
}

describe("cookie jar under a base URL path", () => {
  it("sends back a cookie scoped to the base path and applies the default path", async () => {
    const client = createHttpTestClient(await listen());
    clients.push(client);

    await client.post("/auth/login").expect(200);

    await client.get("/users").expectJson({ cookie: "sid=abc" });
    await client.get("/auth/me").expectJson({ cookie: "scoped=1; sid=abc" });
  });
});
