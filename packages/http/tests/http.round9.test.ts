/**
 * Audit round 9 regression tests.
 *
 * One describe block per finding. Server-side findings are exercised against
 * a real `NodeHttpAdapter` listening on an ephemeral port.
 */

import { describe, it, expect } from "vitest";

import { createServer, request as httpRequest } from "node:http";

import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";

import { tmpdir } from "node:os";

import { join } from "node:path";

import * as http from "../src/index.js";

/* -------------------------------------------------------------------------- */
/* Harness                                                                    */
/* -------------------------------------------------------------------------- */

interface RawResponse {
  readonly status: number | undefined;
  readonly headers: Record<string, string | string[] | undefined>;
  readonly body: string;
  readonly error: string | undefined;
}

function rawRequest(
  port: number,
  path: string,
  options: { method?: string; headers?: Record<string, string> } = {},
): Promise<RawResponse> {
  return new Promise((resolve) => {
    const request = httpRequest(
      {
        host: "127.0.0.1",
        port,
        path,
        method: options.method ?? "GET",
        headers: options.headers ?? {},
      },
      (response) => {
        let body = "";

        response.setEncoding("utf8");

        response.on("data", (chunk: string) => {
          body += chunk;
        });

        response.on("end", () => {
          resolve({
            status: response.statusCode,
            headers: response.headers,
            body,
            error: undefined,
          });
        });
      },
    );

    request.on("error", (error) => {
      resolve({
        status: undefined,
        headers: {},
        body: "",
        error: error.message,
      });
    });

    request.end();
  });
}

async function withAdapter(
  options: http.NodeAdapterOptions,
  run: (port: number, adapter: http.NodeHttpAdapter) => Promise<void>,
): Promise<void> {
  const adapter = new http.NodeHttpAdapter({ port: 0, ...options });

  await adapter.start();

  try {
    const address = adapter.address;

    if (!address) {
      throw new Error("Adapter did not report an address.");
    }

    await run(address.port, adapter);
  } finally {
    await adapter.stop();
  }
}

/* -------------------------------------------------------------------------- */
/* HTTP-R9-01                                                                 */
/* -------------------------------------------------------------------------- */

describe("HTTP-R9-01: request normalisation failures answer 400, not a reset", () => {
  it("answers a malformed percent-encoded query with 200 and the raw value", async () => {
    await withAdapter(
      {
        handler: async (request) => ({
          status: 200,
          body: JSON.stringify(request.query),
        }),
      },
      async (port) => {
        const response = await rawRequest(port, "/?a=%E0");

        expect(response.error).toBeUndefined();
        expect(response.status).toBe(200);
        expect(JSON.parse(response.body)).toEqual({ a: "%E0" });
      },
    );
  });

  it("splits on the first '=' and decodes '+' as a space", async () => {
    await withAdapter(
      {
        handler: async (request) => ({
          status: 200,
          body: JSON.stringify(request.query),
        }),
      },
      async (port) => {
        const response = await rawRequest(port, "/?a=b=c&q=x+y&flag");

        expect(JSON.parse(response.body)).toEqual({
          a: "b=c",
          q: "x y",
          flag: "",
        });
      },
    );
  });

  it("answers 400 when the request context cannot be created", async () => {
    class BrokenAdapter extends http.NodeHttpAdapter {
      override createRequest(): http.HttpRequestContext {
        throw new TypeError("cannot describe request");
      }
    }

    const adapter = new BrokenAdapter({
      port: 0,
      handler: async () => ({ status: 200 }),
    });

    await adapter.start();

    try {
      const response = await rawRequest(adapter.address?.port ?? 0, "/");

      expect(response.error).toBeUndefined();
      expect(response.status).toBe(400);
      expect(JSON.parse(response.body)).toEqual({ error: "Bad Request" });
      expect(response.headers.connection).toBe("close");
    } finally {
      await adapter.stop();
    }
  });
});

/* -------------------------------------------------------------------------- */
/* HTTP-R9-02                                                                 */
/* -------------------------------------------------------------------------- */

describe("HTTP-R9-02: response cookies cannot inject attributes", () => {
  it("percent-encodes a value that would otherwise start a new attribute", () => {
    const serialized = http.serializeResponseCookie({
      name: "sid",
      value: "x; Domain=evil.com",
      options: { httpOnly: true },
    });

    expect(serialized).toBe("sid=x%3B%20Domain%3Devil.com; HttpOnly");
  });

  it("leaves an already valid value untouched", () => {
    expect(
      http.serializeResponseCookie({ name: "token", value: "abc.DEF-123_=" }),
    ).toBe("token=abc.DEF-123_=");
  });

  it("rejects an invalid name, a bad prefix and an attribute carrying ';'", () => {
    expect(() =>
      http.serializeResponseCookie({ name: "a b", value: "x" }),
    ).toThrow(TypeError);

    expect(() =>
      http.serializeResponseCookie({
        name: "__Host-sid",
        value: "x",
        options: { path: "/app", secure: true },
      }),
    ).toThrow(/Path=\//);

    expect(() =>
      http.serializeResponseCookie({
        name: "__Host-sid",
        value: "x",
        options: { path: "/" },
      }),
    ).toThrow(/Secure/);

    expect(() =>
      http.serializeResponseCookie({
        name: "__Secure-sid",
        value: "x",
      }),
    ).toThrow(/Secure/);

    expect(() =>
      http.serializeResponseCookie({
        name: "sid",
        value: "x",
        options: { domain: "example.com; Secure" },
      }),
    ).toThrow(/domain/i);

    expect(
      http.serializeResponseCookie({
        name: "__Host-sid",
        value: "x",
        options: { path: "/", secure: true },
      }),
    ).toBe("__Host-sid=x; Path=/; Secure");
  });

  it("emits the safe form on the wire", async () => {
    await withAdapter(
      {
        handler: async () =>
          http
            .createResponseContext()
            .cookie("sid", "x; Domain=evil.com")
            .text("ok"),
      },
      async (port) => {
        const response = await rawRequest(port, "/");

        expect(response.headers["set-cookie"]).toEqual([
          "sid=x%3B%20Domain%3Devil.com",
        ]);
      },
    );
  });
});

/* -------------------------------------------------------------------------- */
/* HTTP-R9-03                                                                 */
/* -------------------------------------------------------------------------- */

describe("HTTP-R9-03: redirect() refuses unsafe destinations", () => {
  it("throws on a scheme-relative or non-http destination", () => {
    expect(() => http.createResponseContext().redirect("//evil.com")).toThrow(
      TypeError,
    );

    expect(() =>
      http.createResponseContext().redirect("javascript:alert(1)"),
    ).toThrow(TypeError);

    expect(() => http.redirectResponse("javascript:alert(1)")).toThrow(
      TypeError,
    );

    expect(() => http.redirectResponse("\\\\evil.com")).toThrow(TypeError);
  });

  it("still accepts path references and absolute http(s) URLs", () => {
    expect(http.createResponseContext().redirect("/account").headers).toEqual({
      location: "/account",
    });

    expect(
      http.createResponseContext().redirect("https://other.example/x", 301)
        .status,
    ).toBe(301);

    expect(http.redirectResponse("/login").headers).toEqual({
      location: "/login",
    });
  });

  it("never emits the unsafe Location over the wire", async () => {
    await withAdapter(
      {
        handler: async () => http.createResponseContext().redirect("//evil.com"),
      },
      async (port) => {
        const response = await rawRequest(port, "/");

        expect(response.status).toBe(500);
        expect(response.headers.location).toBeUndefined();
      },
    );
  });
});

/* -------------------------------------------------------------------------- */
/* HTTP-R9-04                                                                 */
/* -------------------------------------------------------------------------- */

describe("HTTP-R9-04: route dispatcher keeps cookies, status text and metadata", () => {
  it("merges everything the handler put on its returned response", async () => {
    const router = new http.HttpRouter();

    router.get("/x", () =>
      http
        .createResponseContext()
        .setStatus(201, "Made")
        .cookie("a", "b", { httpOnly: true })
        .setMetadata("route", "x")
        .text("hi"),
    );

    const dispatcher = new http.RouteDispatcher(http.createRouteMatcher(router));

    const response = http.createResponseContext();

    const result = await dispatcher.dispatch(
      http.createRequestContext({ method: "GET", url: "/x" }),
      response,
    );

    expect(result.handled).toBe(true);
    expect(response.status).toBe(201);
    expect(response.statusText).toBe("Made");
    expect(response.body).toBe("hi");
    expect(response.cookies).toEqual([
      { name: "a", value: "b", options: { httpOnly: true } },
    ]);
    expect(response.metadata).toEqual({ route: "x" });
  });
});

/* -------------------------------------------------------------------------- */
/* HTTP-R9-05                                                                 */
/* -------------------------------------------------------------------------- */

describe("HTTP-R9-05: thrown HttpErrors keep their status, message and headers", () => {
  it("answers a thrown notFound() with 404 and its headers", async () => {
    await withAdapter(
      {
        handler: async () => {
          throw http.notFound("no such thing", { headers: { "x-hint": "gone" } });
        },
      },
      async (port) => {
        const response = await rawRequest(port, "/");

        expect(response.status).toBe(404);
        expect(JSON.parse(response.body)).toEqual({
          error: "no such thing",
          code: "NOT_FOUND",
        });
        expect(response.headers["x-hint"]).toBe("gone");
      },
    );
  });

  it("answers a thrown unauthorized() with 401 and WWW-Authenticate", async () => {
    await withAdapter(
      {
        handler: async () => {
          throw http.unauthorized("need token", {
            headers: { "www-authenticate": "Bearer" },
          });
        },
      },
      async (port) => {
        const response = await rawRequest(port, "/");

        expect(response.status).toBe(401);
        expect(response.headers["www-authenticate"]).toBe("Bearer");
      },
    );
  });

  it("unwraps the middleware pipeline's wrappers", async () => {
    const pipeline = new http.HttpMiddlewarePipeline();

    pipeline.use(async () => {
      throw http.forbidden("nope");
    });

    await withAdapter(
      {
        handler: async (request) =>
          pipeline.execute(request, http.createResponseContext()),
      },
      async (port) => {
        const response = await rawRequest(port, "/");

        expect(response.status).toBe(403);
        expect(JSON.parse(response.body)).toEqual({
          error: "nope",
          code: "FORBIDDEN",
        });
      },
    );
  });

  it("does not leak the message of a non-exposed 5xx or of a plain Error", async () => {
    await withAdapter(
      {
        handler: async () => {
          throw http.serviceUnavailable("db password is hunter2");
        },
      },
      async (port) => {
        const response = await rawRequest(port, "/");

        expect(response.status).toBe(503);
        expect(JSON.parse(response.body)).toEqual({
          error: "Service Unavailable",
        });
      },
    );

    await withAdapter(
      {
        handler: async () => {
          throw new Error("secret internals");
        },
      },
      async (port) => {
        const response = await rawRequest(port, "/");

        expect(response.status).toBe(500);
        expect(JSON.parse(response.body)).toEqual({
          error: "Internal Server Error",
        });
      },
    );
  });

  it("still defers to a configured errorHandler", async () => {
    await withAdapter(
      {
        handler: async () => {
          throw http.notFound("nope");
        },
        errorHandler: async () => ({ status: 418, body: "teapot" }),
      },
      async (port) => {
        const response = await rawRequest(port, "/");

        expect(response.status).toBe(418);
        expect(response.body).toBe("teapot");
      },
    );
  });
});

/* -------------------------------------------------------------------------- */
/* HTTP-R9-06                                                                 */
/* -------------------------------------------------------------------------- */

describe("HTTP-R9-06: restarting on an external server does not leak listeners", () => {
  it("keeps exactly one clientError listener across start/stop cycles", async () => {
    const server = createServer();

    const adapter = new http.NodeHttpAdapter({
      port: 0,
      server,
      handler: async () => ({ status: 200 }),
    });

    for (let cycle = 0; cycle < 3; cycle += 1) {
      await adapter.start();

      expect(server.listenerCount("clientError")).toBe(1);

      await adapter.stop();

      expect(server.listenerCount("clientError")).toBe(0);
    }

    expect(server.listenerCount("request")).toBe(1);
  });
});

/* -------------------------------------------------------------------------- */
/* HTTP-R9-07                                                                 */
/* -------------------------------------------------------------------------- */

describe("HTTP-R9-07: the client can retry a request that carries a body", () => {
  function withUrl(response: Response, url: string): Response {
    Object.defineProperty(response, "url", { value: url });

    return response;
  }

  it("replays the body on the retry instead of failing with 'already used'", async () => {
    let calls = 0;

    const fetchImpl: typeof fetch = async (input) => {
      calls += 1;

      const request = input as Request;

      const text = await request.text();

      if (calls === 1) {
        throw new TypeError("fetch failed");
      }

      return withUrl(
        new Response(JSON.stringify({ got: text }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
        request.url,
      );
    };

    const client = new http.HttpClient({
      fetch: fetchImpl,
      retry: {
        retries: 2,
        retryDelay: 1,
        retryMethods: ["POST"],
        retryOnNetworkError: true,
      },
    });

    const response = await client.request<{ got: string }>(
      "http://api.example/items",
      {
        method: "POST",
        body: "payload",
        headers: { "content-type": "text/plain" },
      },
    );

    expect(calls).toBe(2);
    expect(response.data).toEqual({ got: "payload" });
  });
});

/* -------------------------------------------------------------------------- */
/* HTTP-R9-08                                                                 */
/* -------------------------------------------------------------------------- */

describe("HTTP-R9-08: the README quick start uses real exports", () => {
  it("does not export the names the old README used", () => {
    expect((http as Record<string, unknown>).createHTTPServer).toBeUndefined();
    expect(typeof http.createHttpServer).toBe("function");
    expect(typeof http.createNodeHttpAdapter).toBe("function");
  });

  it("runs the documented quick start end to end", async () => {
    const server = http.createHttpServer({
      adapter: http.createNodeHttpAdapter({ host: "127.0.0.1", port: 0 }),
      handler: async (request: http.HttpRequestContext) =>
        http
          .createResponseContext()
          .text(`Hello from Zudojs (${request.path})`),
    });

    await server.start();

    try {
      const port = server.address?.port ?? 0;

      const response = await rawRequest(port, "/hello?x=1");

      expect(response.status).toBe(200);
      expect(response.body).toBe("Hello from Zudojs (/hello)");
    } finally {
      await server.stop();
    }
  });
});

/* -------------------------------------------------------------------------- */
/* HTTP-R9-09                                                                 */
/* -------------------------------------------------------------------------- */

describe("HTTP-R9-09: static middleware serves files under the Node adapter", () => {
  it("accepts the adapter's request-target instead of throwing Invalid URL", async () => {
    const root = mkdtempSync(join(tmpdir(), "zudo-r9-static-"));

    mkdirSync(join(root, "pub"));

    writeFileSync(join(root, "pub", "app.txt"), "PLAIN");

    const pipeline = new http.HttpMiddlewarePipeline();

    pipeline.use(http.createStaticMiddleware({ root }));

    pipeline.use(async () => http.createResponseContext().setStatus(404));

    await withAdapter(
      {
        handler: async (request) =>
          pipeline.execute(request, http.createResponseContext()),
      },
      async (port) => {
        const hit = await rawRequest(port, "/pub/app.txt?v=1");

        expect(hit.status).toBe(200);
        expect(hit.body).toBe("PLAIN");
        expect(hit.headers["content-type"]).toBe("text/plain");

        const miss = await rawRequest(port, "/pub/missing.txt");

        expect(miss.status).toBe(404);

        const traversal = await rawRequest(port, "/pub/%2e%2e/%2e%2e/etc/passwd");

        expect(traversal.status).toBe(404);
      },
    );
  });
});
