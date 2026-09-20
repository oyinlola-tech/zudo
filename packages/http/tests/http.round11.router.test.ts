/**
 * Audit round 11 regression tests for the HTTP router, negotiation and
 * cache-control modules. One `describe` per finding id.
 */

import { describe, it, expect } from "vitest";

import * as http from "../src/index.js";

import { createRouteMatcher } from "../src/httpRouter/matching/httpRoute.matcher.js";

import { RouteDispatcher } from "../src/httpRouter/dispatch/httpRoute.dispatcher.js";

import {
  calculateFreshness,
  isFresh,
} from "../src/httpCacheControl/httpCacheControl.freshness.js";

/* -------------------------------------------------------------------------- */
/* HTTPA-01                                                                   */
/* -------------------------------------------------------------------------- */

describe("HTTPA-01: an OPTIONS fallback never reaches a route handler", () => {
  it("does not run a DELETE-only handler for OPTIONS", async () => {
    const effects: string[] = [];

    const router = new http.HttpRouter();

    router.delete("/accounts/:id", (ctx) => {
      effects.push(`DELETED ${String(ctx.params["id"])}`);

      return http.createResponseContext().setStatus(204);
    });

    const dispatcher = new RouteDispatcher(createRouteMatcher(router));

    const response = http.createResponseContext();

    await dispatcher.dispatch(
      http.createRequestContext({ method: "OPTIONS", url: "/accounts/42" }),
      response,
    );

    expect(effects).toEqual([]);
  });

  it("does not run route middleware for OPTIONS either", async () => {
    const effects: string[] = [];

    const router = new http.HttpRouter();

    router.post("/thing", () => http.createResponseContext().setStatus(201), {
      middleware: [
        async (_context, next) => {
          effects.push("middleware");

          return next();
        },
      ],
    });

    const dispatcher = new RouteDispatcher(createRouteMatcher(router));

    await dispatcher.dispatch(
      http.createRequestContext({ method: "OPTIONS", url: "/thing" }),
      http.createResponseContext(),
    );

    expect(effects).toEqual([]);
  });

  it("still answers OPTIONS with an Allow header", async () => {
    const router = new http.HttpRouter();

    router.delete("/accounts/:id", () =>
      http.createResponseContext().setStatus(204),
    );

    const dispatcher = new RouteDispatcher(createRouteMatcher(router));

    const response = http.createResponseContext();

    const result = await dispatcher.dispatch(
      http.createRequestContext({ method: "OPTIONS", url: "/accounts/42" }),
      response,
    );

    expect(result.matched).toBe(true);
    expect(response.status).toBe(204);
    expect(String(response.headers["allow"])).toContain("DELETE");
  });

  it("still dispatches an explicitly registered OPTIONS route", async () => {
    const effects: string[] = [];

    const router = new http.HttpRouter();

    router.options("/accounts/:id", () => {
      effects.push("explicit-options");

      return http.createResponseContext().setStatus(200);
    });

    const dispatcher = new RouteDispatcher(createRouteMatcher(router));

    await dispatcher.dispatch(
      http.createRequestContext({ method: "OPTIONS", url: "/accounts/42" }),
      http.createResponseContext(),
    );

    expect(effects).toEqual(["explicit-options"]);
  });
});

/* -------------------------------------------------------------------------- */
/* HTTPA-02                                                                   */
/* -------------------------------------------------------------------------- */

describe("HTTPA-02: route middleware writes to ctx.response survive", () => {
  it("keeps headers and cookies a middleware set before the handler ran", async () => {
    const router = new http.HttpRouter();

    router.get("/secure", () => http.createResponseContext().text("body"), {
      middleware: [
        async (context, next) => {
          context.response.header("x-before", "1");

          context.response.cookie("guard", "on");

          const result = await next();

          context.response.header("x-after", "2");

          return result;
        },
      ],
    });

    const { response } = await router.dispatch(
      http.createRequestContext({ method: "GET", url: "/secure" }),
    );

    expect(response.status).toBe(200);
    expect(response.headers["x-before"]).toBe("1");
    expect(response.headers["x-after"]).toBe("2");
    expect(response.cookies).toHaveLength(1);
    expect(response.body).toBe("body");
  });

  it("lets a middleware short-circuit without running the handler", async () => {
    const effects: string[] = [];

    const router = new http.HttpRouter();

    router.get("/secure", () => {
      effects.push("handler");

      return http.createResponseContext().text("body");
    }, {
      middleware: [
        async () => http.createResponseContext().setStatus(401).text("no"),
      ],
    });

    const { response } = await router.dispatch(
      http.createRequestContext({ method: "GET", url: "/secure" }),
    );

    expect(effects).toEqual([]);
    expect(response.status).toBe(401);
  });
});

/* -------------------------------------------------------------------------- */
/* HTTPA-03                                                                   */
/* -------------------------------------------------------------------------- */

describe("HTTPA-03: route patterns keep their optional-parameter syntax", () => {
  it("registers /account/:id?/profile without truncating at the ?", () => {
    const router = new http.HttpRouter();

    router.get("/account/:id?/profile", () =>
      http.createResponseContext().text("profile"),
    );

    expect(router.list()[0]?.path).toBe("/account/:id?/profile");

    expect(router.match("GET", "/account/999").matched).toBe(false);
    expect(router.match("GET", "/account/999/profile").matched).toBe(true);
    expect(router.match("GET", "/account/profile").matched).toBe(true);
  });

  it("accepts an optional brace parameter", () => {
    const router = new http.HttpRouter();

    expect(() =>
      router.get("/files/{name?}", () => http.createResponseContext()),
    ).not.toThrow();

    expect(router.match("GET", "/files").matched).toBe(true);
    expect(router.match("GET", "/files/a.txt").matched).toBe(true);
  });

  it("does not treat /users/:id and /users/:id? as the same route", () => {
    const router = new http.HttpRouter();

    router.get("/users/:id", () => http.createResponseContext());

    expect(() =>
      router.get("/users/:id?", () => http.createResponseContext()),
    ).not.toThrow();
  });

  it("still strips a query string from a request path", () => {
    const router = new http.HttpRouter();

    router.get("/search", () => http.createResponseContext().text("ok"));

    expect(router.match("GET", "/search?q=1").matched).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* HTTPA-05                                                                   */
/* -------------------------------------------------------------------------- */

describe("HTTPA-05: cache freshness ages a response", () => {
  it("reports a one-hour-old max-age=60 response stale", () => {
    const date = new Date(Date.now() - 3_600_000).toUTCString();

    expect(
      isFresh({ "cache-control": "max-age=60", date }),
    ).toBe(false);
  });

  it("reports a response whose Expires is in the past stale", () => {
    const date = new Date(Date.now() - 3_600_000).toUTCString();

    const expires = new Date(Date.now() - 3_480_000).toUTCString();

    expect(isFresh({ date, expires })).toBe(false);
  });

  it("still reports a just-issued max-age=60 response fresh", () => {
    const date = new Date().toUTCString();

    expect(isFresh({ "cache-control": "max-age=60", date })).toBe(true);
  });

  it("adds the Age header to the apparent age", () => {
    const date = new Date(Date.now() - 30_000).toUTCString();

    const freshness = calculateFreshness({
      "cache-control": "max-age=100",
      date,
      age: "80",
    });

    expect(freshness.age).toBeGreaterThanOrEqual(110);
    expect(freshness.stale).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* HTTPA-06                                                                   */
/* -------------------------------------------------------------------------- */

describe("HTTPA-06: strictTrailingSlash is honoured", () => {
  it("rejects a trailing slash on a strict router", () => {
    const strict = new http.HttpRouter({ strictTrailingSlash: true });

    strict.get("/users", () => http.createResponseContext());

    expect(strict.match("GET", "/users").matched).toBe(true);
    expect(strict.match("GET", "/users/").matched).toBe(false);
  });

  it("requires the trailing slash when the pattern declares one", () => {
    const strict = new http.HttpRouter({ strictTrailingSlash: true });

    strict.get("/users/", () => http.createResponseContext());

    expect(strict.match("GET", "/users/").matched).toBe(true);
    expect(strict.match("GET", "/users").matched).toBe(false);
  });

  it("stays lenient by default", () => {
    const router = new http.HttpRouter();

    router.get("/users", () => http.createResponseContext());

    expect(router.match("GET", "/users/").matched).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* HTTPA-07                                                                   */
/* -------------------------------------------------------------------------- */

describe("HTTPA-07: a literal prefix outranks an all-parameter pattern", () => {
  it("prefers /admin/*rest over /:p/:q/:r/:s", async () => {
    const calls: string[] = [];

    const router = new http.HttpRouter();

    router.get("/:p/:q/:r/:s", () => {
      calls.push("generic-handler");

      return http.createResponseContext().text("generic");
    });

    router.get("/admin/*rest", () => {
      calls.push("admin-handler");

      return http.createResponseContext().text("admin");
    });

    const match = router.match("GET", "/admin/a/b/c");

    expect(match.route?.path).toBe("/admin/*rest");

    await router.dispatch(
      http.createRequestContext({ method: "GET", url: "/admin/a/b/c" }),
    );

    expect(calls).toEqual(["admin-handler"]);
  });

  it("still prefers a full literal path over a parameter", () => {
    const router = new http.HttpRouter();

    router.get("/users/:id", () => http.createResponseContext());

    router.get("/users/me", () => http.createResponseContext());

    expect(router.match("GET", "/users/me").route?.path).toBe("/users/me");
  });

  it("prefers a parameter over a wildcard in the same position", () => {
    const router = new http.HttpRouter();

    router.get("/files/*rest", () => http.createResponseContext());

    router.get("/files/:name", () => http.createResponseContext());

    expect(router.match("GET", "/files/a").route?.path).toBe("/files/:name");
  });
});

/* -------------------------------------------------------------------------- */
/* HTTPA-09                                                                   */
/* -------------------------------------------------------------------------- */

describe("HTTPA-09: an explicit q=0 outranks a wildcard", () => {
  it("returns 0 for gzip when the header rejects it explicitly", () => {
    expect(http.getEncodingQuality("*;q=1, gzip;q=0", "gzip")).toBe(0);
  });

  it("returns 0 for a language rejected explicitly", () => {
    expect(http.getLanguageQuality("*;q=1, de;q=0", "de")).toBe(0);
  });

  it("still uses the wildcard for a coding it does not name", () => {
    expect(http.getEncodingQuality("*;q=0.5, gzip;q=0", "br")).toBe(0.5);
  });

  it("still prefers the more specific language tag", () => {
    expect(http.getLanguageQuality("en;q=0.5, en-gb;q=0.9", "en-GB")).toBe(0.9);
  });
});

/* -------------------------------------------------------------------------- */
/* HTTPA-10                                                                   */
/* -------------------------------------------------------------------------- */

describe("HTTPA-10: Allow honours the router's case sensitivity", () => {
  it("does not advertise a route that differs only by case", () => {
    const router = new http.HttpRouter({ caseSensitive: true });

    router.get("/users", () => http.createResponseContext());

    router.post("/Users", () => http.createResponseContext());

    const match = router.match("OPTIONS", "/users");

    expect([...match.allowedMethods].sort()).toEqual(
      ["GET", "HEAD", "OPTIONS"].sort(),
    );
  });

  it("still folds case on a case-insensitive router", () => {
    const router = new http.HttpRouter();

    router.get("/users", () => http.createResponseContext());

    router.post("/Users", () => http.createResponseContext());

    expect([...router.match("OPTIONS", "/users").allowedMethods]).toContain(
      "POST",
    );
  });
});

/* -------------------------------------------------------------------------- */
/* HTTPA-11                                                                   */
/* -------------------------------------------------------------------------- */

describe("HTTPA-11: preserveResponse is honoured", () => {
  it("keeps the dispatch response's existing values when set", async () => {
    const router = new http.HttpRouter();

    router.get("/x", () =>
      http.createResponseContext().setStatus(201).header("x-handler", "1"),
    );

    const dispatcher = new RouteDispatcher(createRouteMatcher(router), {
      preserveResponse: true,
    });

    const response = http.createResponseContext()
      .setStatus(200)
      .header("x-ambient", "keep");

    await dispatcher.dispatch(
      http.createRequestContext({ method: "GET", url: "/x" }),
      response,
    );

    expect(response.status).toBe(200);
    expect(response.headers["x-ambient"]).toBe("keep");
    expect(response.headers["x-handler"]).toBeUndefined();
  });

  it("overwrites by default", async () => {
    const router = new http.HttpRouter();

    router.get("/x", () =>
      http.createResponseContext().setStatus(201).header("x-handler", "1"),
    );

    const dispatcher = new RouteDispatcher(createRouteMatcher(router));

    const response = http.createResponseContext().setStatus(200);

    await dispatcher.dispatch(
      http.createRequestContext({ method: "GET", url: "/x" }),
      response,
    );

    expect(response.status).toBe(201);
    expect(response.headers["x-handler"]).toBe("1");
  });
});

/* -------------------------------------------------------------------------- */
/* HTTPA-12                                                                   */
/* -------------------------------------------------------------------------- */

describe("HTTPA-12: negotiateEncoding falls back to identity", () => {
  it("returns identity for a header naming only unknown codings", () => {
    expect(http.negotiateEncoding("zstd", ["gzip", "identity"])).toBe(
      "identity",
    );
  });

  it("returns undefined when identity is explicitly rejected", () => {
    expect(
      http.negotiateEncoding("zstd, identity;q=0", ["gzip", "identity"]),
    ).toBeUndefined();
  });

  it("returns undefined when a wildcard rejection covers identity", () => {
    expect(http.negotiateEncoding("zstd, *;q=0", ["gzip", "identity"])).toBe(
      undefined,
    );
  });

  it("returns undefined when identity is not available", () => {
    expect(http.negotiateEncoding("zstd", ["gzip", "br"])).toBeUndefined();
  });

  it("still prefers an explicitly named coding", () => {
    expect(http.negotiateEncoding("gzip", ["gzip", "identity"])).toBe("gzip");
  });
});
