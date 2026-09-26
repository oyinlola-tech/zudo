/**
 * Round 12 regression tests: the academy package findings assigned to
 * `@zudojs/http` (#49–#56, #65, #66, #83, #93, #107, #113, #114, #115, #126,
 * #131, #137). Each block names the finding it reproduces.
 */

import { describe, expect, it } from "vitest";

import {
  DuplicateRouteParameterError,
  HttpRouterError,
  InvalidRoutePatternError,
  RouteConflictError,
  ValidationError,
} from "@zudojs/errors";

import * as http from "../src/index.js";

import { jsonBody, sendRaw, withAdapter } from "./round10.harness.js";

function headerOf(head: string, name: string): string | undefined {
  const line = head
    .split("\r\n")
    .find((entry) => entry.toLowerCase().startsWith(`${name.toLowerCase()}:`));

  return line?.slice(line.indexOf(":") + 1).trim();
}

function request(method: string, url: string): http.HttpRequestContext {
  return http.createRequestContext({ method, url });
}

/* -------------------------------------------------------------------------- */
/* #49 / #50 — pattern validation                                             */
/* -------------------------------------------------------------------------- */

describe("#49 duplicate route parameters are refused", () => {
  it("throws DuplicateRouteParameterError for /bad/:a/:a", () => {
    const router = http.createRouter();

    expect(() => router.get("/bad/:a/:a", () => "x")).toThrow(
      DuplicateRouteParameterError,
    );
  });

  it("also refuses a wildcard reusing a parameter name", () => {
    const router = http.createRouter();

    expect(() => router.get("/bad/:a/*a", () => "x")).toThrow(
      DuplicateRouteParameterError,
    );
  });
});

describe("#50 a wildcard must be the final segment", () => {
  it("throws InvalidRoutePatternError for /files/*rest/more", () => {
    const router = http.createRouter();

    expect(() => router.get("/files/*rest/more", () => "x")).toThrow(
      InvalidRoutePatternError,
    );
  });
});

/* -------------------------------------------------------------------------- */
/* #51 — specificity and shadow detection                                     */
/* -------------------------------------------------------------------------- */

describe("#51 constrained parameters outrank unconstrained ones", () => {
  it("routes /x/42 to the constrained route registered second", () => {
    const router = http.createRouter();

    router.get("/x/:slug", () => "slug", { name: "slug" });
    router.get("/x/:id(\\d+)", () => "id", { name: "id" });

    expect(router.match("GET", "/x/42").route?.name).toBe("id");
    expect(router.match("GET", "/x/abc").route?.name).toBe("slug");
  });

  it("prefers a method-specific route over an equally specific `*` route", () => {
    const router = http.createRouter();

    router.all("/x/:id", () => "any", { name: "any" });
    router.get("/x/:id", () => "get", { name: "get" });

    expect(router.match("GET", "/x/1").route?.name).toBe("get");
    expect(router.match("POST", "/x/1").route?.name).toBe("any");
  });

  it("throws RouteConflictError when a new route can never be reached", () => {
    const router = http.createRouter();

    router.get("/x/:id", () => "id");

    expect(() => router.get("/x/:slug", () => "slug")).toThrow(
      RouteConflictError,
    );
  });

  it("throws when a new route makes an existing one unreachable", () => {
    const router = http.createRouter();

    router.get("/users/:id(\\d+)", () => "id");

    expect(() => router.get("/users/:n(\\d+)", () => "n")).toThrow(
      RouteConflictError,
    );
  });

  it("does not flag routes that only partially overlap", () => {
    const router = http.createRouter();

    router.get("/x/:id(\\d+)", () => "id");
    router.get("/x/:slug", () => "slug");
    router.get("/x/*rest", () => "rest");
    router.post("/x/:id", () => "post");
    router.get("/x/:id/edit", () => "edit");

    expect(router.count()).toBe(5);
  });

  it("can be switched off with shadowedRoutes: 'ignore'", () => {
    const router = http.createRouter({ shadowedRoutes: "ignore" });

    router.get("/x/:id", () => "id");

    expect(() => router.get("/x/:slug", () => "slug")).not.toThrow();
  });
});

/* -------------------------------------------------------------------------- */
/* #52 — Allow header                                                         */
/* -------------------------------------------------------------------------- */

describe("#52 405 Allow lists the automatic HEAD and OPTIONS", () => {
  it("includes HEAD and OPTIONS in allowedMethods and in the Allow header", async () => {
    const router = http.createRouter();

    router.get("/r", () => "get");
    router.patch("/r", () => "patch");

    const match = router.match("DELETE", "/r");

    expect(match.matched).toBe(false);
    expect([...match.allowedMethods].sort()).toEqual(
      ["GET", "HEAD", "OPTIONS", "PATCH"].sort(),
    );

    const result = await router.dispatch(request("DELETE", "/r"));

    expect(result.response.status).toBe(405);

    const allow = String(result.response.headers["allow"]);

    expect(allow).toContain("HEAD");
    expect(allow).toContain("OPTIONS");
  });
});

/* -------------------------------------------------------------------------- */
/* #53 — parseQueryString                                                     */
/* -------------------------------------------------------------------------- */

describe("#53 the root parseQueryString accepts a bare query string", () => {
  it("parses a=1, ?a=1 and /p?a=1 identically", () => {
    expect(http.parseQueryString("a=1")).toEqual({ a: "1" });
    expect(http.parseQueryString("?a=1")).toEqual({ a: "1" });
    expect(http.parseQueryString("/p?a=1")).toEqual({ a: "1" });
    expect(http.parseQueryString("a=1&b=2")).toEqual({ a: "1", b: "2" });
  });

  it("still returns an empty record for a path without a query", () => {
    expect(http.parseQueryString("/p")).toEqual({});
    expect(http.parseQueryString("https://h/p")).toEqual({});
  });
});

/* -------------------------------------------------------------------------- */
/* #54 / #137 — Node adapter error paths                                      */
/* -------------------------------------------------------------------------- */

describe("#54 an over-long query is answered with 414, not 400", () => {
  it("answers 414 for 1001 keys", async () => {
    await withAdapter({ handler: async () => ({ ok: true }) }, async (port) => {
      const keys = Array.from({ length: 1001 }, (_, i) => `k${i}=1`).join("&");

      const response = await sendRaw(port, `/?${keys}`);

      expect(response.status).toBe(414);
      expect(jsonBody(response)).toMatchObject({ code: "URI_TOO_LONG" });
    });
  });
});

describe("#137 adapter-built error responses carry security headers", () => {
  it("adds them to a request-guard 400", async () => {
    await withAdapter({ handler: async () => ({ ok: true }) }, async (port) => {
      const headers: Record<string, string> = { host: "x" };

      for (let index = 0; index < 101; index += 1) {
        headers[`x-h${index}`] = "v";
      }

      const response = await sendRaw(port, "/", headers);

      expect(response.status).toBe(400);
      expect(headerOf(response.head, "x-content-type-options")).toBe("nosniff");
      expect(headerOf(response.head, "x-frame-options")).toBe("DENY");
      expect(jsonBody(response)).toMatchObject({
        error: "Bad Request",
        code: "BAD_REQUEST",
      });
    });
  });

  it("adds them to the adapter's 413", async () => {
    await withAdapter(
      { handler: async () => ({ ok: true }), maxBodySize: 10 },
      async (port) => {
        const response = await sendRaw(
          port,
          "/",
          { host: "x", "content-length": "1000" },
          "POST",
        );

        expect(response.status).toBe(413);
        expect(headerOf(response.head, "x-content-type-options")).toBe("nosniff");
        expect(jsonBody(response)).toMatchObject({
          error: "Payload Too Large",
          code: "PAYLOAD_TOO_LARGE",
        });
      },
    );
  });

  it("adds them to a thrown 4xx and to an unhandled 500", async () => {
    let fail: () => never = () => {
      throw http.unauthorized("Token expired");
    };

    await withAdapter({ handler: async () => fail() }, async (port) => {
      const denied = await sendRaw(port, "/");

      expect(denied.status).toBe(401);
      expect(headerOf(denied.head, "x-content-type-options")).toBe("nosniff");
      expect(headerOf(denied.head, "content-security-policy")).toBeDefined();

      fail = () => {
        throw new Error("boom");
      };

      const crashed = await sendRaw(port, "/");

      expect(crashed.status).toBe(500);
      expect(headerOf(crashed.head, "x-content-type-options")).toBe("nosniff");
      expect(jsonBody(crashed)).toEqual({
        error: "Internal Server Error",
        code: "INTERNAL_SERVER_ERROR",
      });
    });
  });

  it("can be disabled or replaced with securityHeaders", async () => {
    await withAdapter(
      {
        handler: async () => {
          throw new Error("boom");
        },
        securityHeaders: false,
      },
      async (port) => {
        const response = await sendRaw(port, "/");

        expect(response.status).toBe(500);
        expect(headerOf(response.head, "x-content-type-options")).toBeUndefined();
      },
    );

    await withAdapter(
      {
        handler: async () => {
          throw new Error("boom");
        },
        securityHeaders: { "x-custom-guard": "1" },
      },
      async (port) => {
        const response = await sendRaw(port, "/");

        expect(headerOf(response.head, "x-custom-guard")).toBe("1");
        expect(headerOf(response.head, "x-frame-options")).toBeUndefined();
      },
    );
  });

  it("aligns the default CSP and HSTS with @zudojs/security", () => {
    expect(http.createDefaultCSPOptions()["style-src"]).not.toContain(
      "'unsafe-inline'",
    );
    expect(http.createDefaultCSPOptions()["object-src"]).toEqual(["'none'"]);
    expect(http.createDefaultHSTSOptions().maxAge).toBe(63_072_000);
  });
});

/* -------------------------------------------------------------------------- */
/* #55 — consistent bodies and query                                          */
/* -------------------------------------------------------------------------- */

describe("#55 router default bodies are serialized like .json()", () => {
  it("returns a JSON string body for the default 404", async () => {
    const router = http.createRouter();

    const result = await router.dispatch(request("GET", "/missing"));

    expect(result.response.status).toBe(404);
    expect(typeof result.response.body).toBe("string");
    expect(JSON.parse(String(result.response.body))).toMatchObject({
      error: "Not Found",
      code: "NOT_FOUND",
    });
  });

  it("parses the query from the URL when createRequestContext gets none", () => {
    const context = http.createRequestContext({ method: "GET", url: "/x?a=1&b=2" });

    expect(context.query).toEqual({ a: "1", b: "2" });
    expect(context.getQuery("a")).toBe("1");
  });

  it("keeps an explicit query as given", () => {
    const context = http.createRequestContext({
      method: "GET",
      url: "/x?a=1",
      query: { z: "9" },
    });

    expect(context.query).toEqual({ z: "9" });
  });
});

/* -------------------------------------------------------------------------- */
/* #56 — buildRoutePath                                                       */
/* -------------------------------------------------------------------------- */

describe("#56 buildRoutePath", () => {
  it("drops the trailing slash left by an omitted optional parameter", () => {
    expect(http.buildRoutePath("/reports/:year/:month?", { year: 2026 })).toBe(
      "/reports/2026",
    );
  });

  it("throws HttpRouterError for a missing required parameter", () => {
    expect(() => http.buildRoutePath("/users/:id")).toThrow(HttpRouterError);
  });

  it("strips constraints and fills brace parameters and wildcards", () => {
    expect(http.buildRoutePath("/users/:id(\\d+)", { id: 5 })).toBe("/users/5");
    expect(http.buildRoutePath("/files/{name}", { name: "a b" })).toBe(
      "/files/a%20b",
    );
    expect(http.buildRoutePath("/assets/*path", { path: "css/app.css" })).toBe(
      "/assets/css/app.css",
    );
  });
});

/* -------------------------------------------------------------------------- */
/* #65 — routes are sorted once                                               */
/* -------------------------------------------------------------------------- */

describe("#65 the router caches its sorted routes", () => {
  it("returns the same compiled list until the routes change", () => {
    const router = http.createRouter();

    router.get("/a", () => "a");
    router.get("/:b", () => "b");

    const first = router.compiled();

    expect(router.compiled()).toBe(first);

    router.get("/c", () => "c");

    expect(router.compiled()).not.toBe(first);
    expect(router.compiled()).toBe(router.compiled());
  });
});

/* -------------------------------------------------------------------------- */
/* #66 / #83 — one limit each                                                 */
/* -------------------------------------------------------------------------- */

describe("#66 the guard and the adapters share one default body limit", () => {
  it("uses DEFAULT_MAX_BODY_SIZE everywhere", () => {
    expect(http.DEFAULT_SECURITY_CONFIG.maxBodySize).toBe(http.DEFAULT_MAX_BODY_SIZE);
  });
});

describe("#83 multipart defaults agree", () => {
  it("uses one default file-count limit", () => {
    expect(http.DEFAULT_MAX_FILES).toBe(http.DEFAULT_MULTIPART_MAX_FILES);
  });

  it("sniffs common file signatures", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);

    expect(http.sniffContentType(png)).toBe("image/png");
    expect(http.sniffContentType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(
      "image/jpeg",
    );
    expect(http.sniffContentType(new TextEncoder().encode("%PDF-1.7"))).toBe(
      "application/pdf",
    );
    expect(http.sniffContentType(new TextEncoder().encode("hello"))).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/* #93 — router onError                                                       */
/* -------------------------------------------------------------------------- */

describe("#93 router.dispatch can hand handler errors to onError", () => {
  it("returns the onError response and reports the error", async () => {
    const seen: unknown[] = [];

    const router = http.createRouter({
      onError: (error) => {
        seen.push(error);

        return http.createResponseContext({ status: 500 }).json({ handled: true });
      },
    });

    router.get("/boom", () => {
      throw new Error("boom");
    });

    const result = await router.dispatch(request("GET", "/boom"));

    expect(result.response.status).toBe(500);
    expect(result.error).toBeInstanceOf(Error);
    expect(seen).toHaveLength(1);
  });

  it("still rethrows when no onError is configured", async () => {
    const router = http.createRouter();

    router.get("/boom", () => {
      throw new Error("boom");
    });

    await expect(router.dispatch(request("GET", "/boom"))).rejects.toThrow("boom");
  });
});

/* -------------------------------------------------------------------------- */
/* #107 — RouteTree                                                           */
/* -------------------------------------------------------------------------- */

describe("#107 RouteTree agrees with the router", () => {
  it("prefers the literal-anchored wildcard and captures the tail", () => {
    const tree = http.createRouteTree();

    tree.insert("/:org/:page/:section/:id", "tenant");
    tree.insert("/admin/*rest", "admin");

    const match = tree.lookup("/admin/a/b/c");

    expect(match?.handler).toBe("admin");
    expect(match?.params).toEqual({ rest: "a/b/c" });
  });

  it("extracts every parameter and matches case-insensitively by default", () => {
    const tree = http.createRouteTree();

    tree.insert("/:org/:page", "pages");
    tree.insert("/payments/:id", "payment");

    expect(tree.lookup("/acme/home")?.params).toEqual({ org: "acme", page: "home" });
    expect(tree.lookup("/PAYMENTS/x")?.handler).toBe("payment");
    expect(tree.lookup("/PAYMENTS/x")?.params).toEqual({ id: "x" });

    const strict = http.createRouteTree({ caseSensitive: true });

    strict.insert("/payments/:id", "payment");

    expect(strict.lookup("/PAYMENTS/x")).toBeUndefined();
  });

  it("supports optional parameters", () => {
    const tree = http.createRouteTree();

    tree.insert("/users/:id?", "users");

    expect(tree.lookup("/users")?.handler).toBe("users");
    expect(tree.lookup("/users/7")?.params).toEqual({ id: "7" });
  });
});

/* -------------------------------------------------------------------------- */
/* #113 — client factories                                                    */
/* -------------------------------------------------------------------------- */

describe("#113 client factories are exported from the package root", () => {
  it("exposes createHttpClient and the http* helpers", () => {
    expect(typeof http.createHttpClient).toBe("function");
    expect(typeof http.createHttpClientWithBaseUrl).toBe("function");
    expect(typeof http.httpGet).toBe("function");
    expect(typeof http.httpPost).toBe("function");
    expect(typeof http.httpDelete).toBe("function");
    expect(http.createHttpClient()).toBeInstanceOf(http.HttpClient);
  });
});

/* -------------------------------------------------------------------------- */
/* #114 / #115 / #126 / #131 — error bodies                                   */
/* -------------------------------------------------------------------------- */

async function throughGenericAdapter(
  handler: http.HttpHandler,
  options: Partial<http.GenericAdapterOptions> = {},
): Promise<http.HttpResponseContext> {
  let captured: http.HttpResponseContext | undefined;

  const adapter = new http.GenericHttpAdapter({
    requestFactory: () => ({ method: "GET", url: "/" }),
    writerFactory: () => {
      throw new Error("unused");
    },
    responseWriter: (_response, context) => {
      captured = context;
    },
    handler,
    ...options,
  });

  await adapter.handle({});

  if (!captured) {
    throw new Error("no response written");
  }

  return captured;
}

describe("#114 every framework error body carries `code`", () => {
  it("adds code to the default 405 body", async () => {
    const router = http.createRouter();

    router.get("/r", () => "get");

    const result = await router.dispatch(request("POST", "/r"));

    expect(JSON.parse(String(result.response.body))).toMatchObject({
      error: "Method Not Allowed",
      code: "METHOD_NOT_ALLOWED",
    });
  });

  it("adds top-level code and message to the rate limit body", async () => {
    const pipeline = new http.HttpMiddlewarePipeline();

    pipeline.use(http.createRateLimitMiddleware({ max: 1, windowMs: 60_000 }));
    pipeline.use(async () => http.createResponseContext().text("ok"));

    const run = () =>
      pipeline.execute(
        http.createRequestContext({ method: "GET", url: "/", remoteAddress: "1.2.3.4" }),
        http.createResponseContext(),
      );

    await run();

    const limited = await run();

    expect(limited.status).toBe(429);
    expect(JSON.parse(String(limited.body))).toMatchObject({
      error: { code: "RATE_LIMIT_EXCEEDED" },
      code: "RATE_LIMIT_EXCEEDED",
      message: expect.any(String),
    });
  });

  it("adds a code to non-exposed status errors", async () => {
    const response = await throughGenericAdapter(async () => {
      throw http.internalServerError("secret detail");
    });

    expect(response.status).toBe(500);
    expect(JSON.parse(String(response.body))).toEqual({
      error: "Internal Server Error",
      code: "INTERNAL_SERVER_ERROR",
    });
  });
});

describe("#115 a custom errorHandler keeps the error's headers", () => {
  it("applies Retry-After from the thrown error", async () => {
    const response = await throughGenericAdapter(
      async () => {
        throw http.httpError(423, "Locked", { headers: { "retry-after": "60" } });
      },
      {
        errorHandler: (error) =>
          http
            .createResponseContext({ status: (error as http.HttpError).statusCode })
            .json({ error: "locked" }),
      },
    );

    expect(response.status).toBe(423);
    expect(response.headers["retry-after"]).toBe("60");
  });

  it("does not override a header the handler set itself", async () => {
    const response = await throughGenericAdapter(
      async () => {
        throw http.httpError(429, "Slow", { headers: { "retry-after": "60" } });
      },
      {
        errorHandler: () =>
          http.createResponseContext({ status: 429, headers: { "retry-after": "5" } }),
      },
    );

    expect(response.headers["retry-after"]).toBe("5");
  });
});

describe("#126 serviceUnavailable's message is hidden unless exposed", () => {
  it("sends the status text and code by default, the message with expose: true", async () => {
    const hidden = await throughGenericAdapter(async () => {
      throw http.serviceUnavailable("Down for maintenance until 04:00");
    });

    expect(hidden.status).toBe(503);
    expect(JSON.parse(String(hidden.body))).toEqual({
      error: "Service Unavailable",
      code: "SERVICE_UNAVAILABLE",
    });

    const shown = await throughGenericAdapter(async () => {
      throw http.serviceUnavailable("Down for maintenance until 04:00", {
        expose: true,
      });
    });

    expect(JSON.parse(String(shown.body))).toMatchObject({
      error: "Down for maintenance until 04:00",
      code: "SERVICE_UNAVAILABLE",
    });
  });

  it("never exposes a 5xx message by default", () => {
    expect(http.serviceUnavailable("x").expose).toBe(false);
    expect(http.internalServerError("db password").expose).toBe(false);
  });
});

describe("#131 exposed validation errors include their issues", () => {
  it("adds a sanitized issues list to the body", async () => {
    const response = await throughGenericAdapter(async () => {
      throw new ValidationError("Validation failed", {
        issues: [
          { path: ["email"], code: "invalid_email", message: "Invalid email", value: "secret" },
        ],
      });
    });

    expect(response.status).toBe(400);

    const body = JSON.parse(String(response.body)) as Record<string, unknown>;

    expect(body).toMatchObject({ error: "Validation failed" });
    expect(body.issues).toEqual([
      { path: ["email"], code: "invalid_email", message: "Invalid email" },
    ]);
  });
});
