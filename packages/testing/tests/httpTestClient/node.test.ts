/**
 * createHttpTestClient against plain node:http servers, listeners and URLs.
 */

import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";

import { afterEach, describe, expect, it } from "vitest";

import { createHttpTestClient } from "../../src/httpTestClient/index.js";
import type { HttpTestClient } from "../../src/httpTestClient/index.js";

const clients: HttpTestClient[] = [];
const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.close()));
  await Promise.all(
    servers
      .splice(0)
      .map(
        (s) =>
          new Promise<void>((resolve) =>
            s.listening ? s.close(() => resolve()) : resolve(),
          ),
      ),
  );
});

function track(api: HttpTestClient): HttpTestClient {
  clients.push(api);
  return api;
}

function echo(request: IncomingMessage, response: ServerResponse): void {
  const chunks: Buffer[] = [];
  request.on("data", (chunk: Buffer) => chunks.push(chunk));
  request.on("end", () => {
    if (request.url?.startsWith("/redirect")) {
      response.writeHead(302, { location: "/elsewhere" }).end();
      return;
    }
    if (request.url?.startsWith("/hang")) return;
    response.setHeader("set-cookie", ["a=1; Path=/", "b=2; Path=/scoped"]);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        method: request.method,
        url: request.url,
        cookie: request.headers.cookie ?? null,
        type: request.headers["content-type"] ?? null,
        length: request.headers["content-length"] ?? null,
        body: Buffer.concat(chunks).toString("utf8"),
      }),
    );
  });
}

describe("createHttpTestClient — node:http", () => {
  it("starts a server that is not listening on an ephemeral port and closes it", async () => {
    const server = createServer(echo);
    const api = track(createHttpTestClient(server));

    const origin = await api.start();
    expect(origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(server.listening).toBe(true);

    await api.put("/items/1").send("plain").expectJson({
      method: "PUT",
      url: "/items/1",
      type: "text/plain; charset=utf-8",
      length: "5",
      body: "plain",
    });

    await api.close();
    expect(server.listening).toBe(false);
  });

  it("leaves an already listening server running", async () => {
    const server = createServer(echo);
    servers.push(server);
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );

    const api = track(createHttpTestClient(server));
    await api.delete("/x").expectJson({ method: "DELETE" });
    await api.close();
    expect(server.listening).toBe(true);
  });

  it("serves a (req, res) listener and scopes cookies by path", async () => {
    const api = track(createHttpTestClient(echo));

    await api.get("/first").expectJson({ cookie: null });
    await api.get("/other").expectJson({ cookie: "a=1" });
    await api.patch("/scoped/deep").send({ x: 1 }).expectJson({
      cookie: "b=2; a=1",
      type: "application/json",
      body: '{"x":1}',
    });
    expect(api.cookies.toJSON()).toEqual({ a: "1", b: "2" });
  });

  it("does not use the jar when cookies: false or a Cookie header is set", async () => {
    const off = track(createHttpTestClient(echo, { cookies: false }));
    await off.get("/").expect(200);
    await off.get("/").expectJson({ cookie: null });

    const explicit = track(createHttpTestClient(echo));
    await explicit.get("/").expect(200);
    await explicit
      .get("/")
      .set("cookie", "mine=1")
      .expectJson({ cookie: "mine=1" });
  });

  it("does not follow redirects", async () => {
    await track(createHttpTestClient(echo))
      .get("/redirect")
      .expect(302)
      .expect("location", "/elsewhere");
  });

  it("targets a base URL, including its path prefix", async () => {
    const server = createServer(echo);
    servers.push(server);
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const { port } = server.address() as { readonly port: number };

    const api = track(createHttpTestClient(`http://127.0.0.1:${port}/api/`));
    await api.options("/v1?x=1").query({ y: 2 }).expectJson({
      method: "OPTIONS",
      url: "/api/v1?x=1&y=2",
    });
  });

  it("rejects with a TimeoutError when the server never answers", async () => {
    const api = track(createHttpTestClient(echo, { timeout: 60 }));
    await expect(api.get("/hang")).rejects.toMatchObject({
      name: "TimeoutError",
      message: expect.stringContaining("GET /hang timed out after 60 ms"),
    });
  });

  it("rejects with a NetworkError when nothing listens", async () => {
    const server = createServer();
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const { port } = server.address() as { readonly port: number };
    await new Promise<void>((resolve) => server.close(() => resolve()));

    await expect(
      track(createHttpTestClient(`http://127.0.0.1:${port}`)).get("/"),
    ).rejects.toMatchObject({
      name: "NetworkError",
      message: expect.stringContaining("GET / failed"),
    });
  });

  it("answers 500 when a listener throws", async () => {
    const api = track(
      createHttpTestClient(
        (_request: IncomingMessage, _response: ServerResponse) => {
          throw new Error("listener exploded");
        },
      ),
    );
    await api.get("/").expect(500);
  });
});
