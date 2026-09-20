/**
 * Audit round 10 regression tests: paths and queries (HTTP-01, HTTP-04,
 * HTTP-07). One describe per finding.
 */

import { describe, it, expect } from "vitest";

import * as http from "../src/index.js";

import { sendRaw, withAdapter, jsonBody } from "./round10.harness.js";

function guardedRouterHandler(): http.HttpHandler {
  const router = http.createRouter();

  router.get("/admin", () =>
    http.createResponseContext().json({ secret: "admin-panel" }),
  );

  router.get("/q", (ctx) =>
    http.createResponseContext().json({
      ctx: ctx.query,
      req: ctx.request.query,
      get: ctx.request.getQuery("role") ?? null,
    }),
  );

  const pipeline = new http.HttpMiddlewarePipeline();

  pipeline.use(
    http.createPathMiddleware("/admin", async () =>
      http.createResponseContext().setStatus(401).json({ error: "auth" }),
    ),
  );

  pipeline.use(
    async (context) => (await router.dispatch(context.request)).response,
  );

  return async (request) =>
    pipeline.execute(request, http.createResponseContext());
}

describe("HTTP-01", () => {
  it("guards every spelling the router would dispatch to the route", async () => {
    await withAdapter({ handler: guardedRouterHandler() }, async (port) => {
      for (const target of [
        "/admin",
        "/Admin",
        "/ADMIN",
        "/admin/",
        "/admin//",
      ]) {
        expect((await sendRaw(port, target)).status, target).toBe(401);
      }
    });
  });

  it("can still be made case-sensitive explicitly", async () => {
    const middleware = http.createPathMiddleware(
      "/admin",
      async () => http.createResponseContext().setStatus(401),
      { caseSensitive: true },
    );

    const pipeline = new http.HttpMiddlewarePipeline();

    pipeline.use(middleware);

    const upper = await pipeline.execute(
      http.createRequestContext({ method: "GET", url: "/Admin" }),
      http.createResponseContext(),
    );

    expect(upper.status).toBe(200);
  });
});

describe("HTTP-04", () => {
  it("refuses dot segments, encoded dots and backslashes with 400", async () => {
    await withAdapter({ handler: guardedRouterHandler() }, async (port) => {
      for (const target of [
        "/x/../admin",
        "/x/%2e%2e/admin",
        "/x/%2E./admin",
        "/./admin",
        "/x\\..\\admin",
      ]) {
        expect((await sendRaw(port, target)).status, target).toBe(400);
      }
    });
  });

  it("never parses an origin-form target as an authority", async () => {
    /* Round 11 (HTTPA-08): repeated slashes are collapsed, so the leading
     * `//` no longer survives into the path. The invariant this case exists
     * for is unchanged and is what is asserted here — `evil.com` stays a path
     * segment and never becomes the authority, so the path is never the
     * silently shortened `/admin`. */
    expect(http.getPathname("//evil.com/admin?x=1")).toBe("/evil.com/admin");

    await withAdapter({ handler: guardedRouterHandler() }, async (port) => {
      expect((await sendRaw(port, "//evil/admin")).status).toBe(404);
    });
  });

  it("gives request.path and the router the same canonical path", () => {
    const request = http.createRequestContext({ method: "GET", url: "//h/a" });

    /* Round 11 (HTTPA-08): both sides collapse `//` now, which is what makes
     * them agree — the router normalised it away while the context kept it,
     * so `//admin/secret` dispatched to the route at `/admin/secret` while a
     * guard reading `request.path` saw no match. */
    expect(request.path).toBe("/h/a");
    expect(http.getCanonicalPath("//h/a")).toBe(request.path);
    expect(http.findRequestTargetViolation("/a/%2e%2e/b")).toBeDefined();
    expect(http.findRequestTargetViolation("/a/b.c/..d")).toBeUndefined();
  });
});

describe("HTTP-07", () => {
  it("request.query, getQuery() and ctx.query agree on repeated keys", async () => {
    await withAdapter({ handler: guardedRouterHandler() }, async (port) => {
      const response = await sendRaw(
        port,
        "/q?role=user&role=admin&__proto__=x&constructor=y",
      );

      const body = jsonBody(response) as {
        ctx: unknown;
        req: unknown;
        get: unknown;
      };

      expect(body.ctx).toEqual({ role: ["user", "admin"] });
      expect(body.req).toEqual(body.ctx);
      expect(body.get).toEqual(["user", "admin"]);
    });
  });

  it("returns a null-prototype query record", () => {
    const request = http.createRequestContext({
      method: "GET",
      url: "/",
      query: { a: "1" },
    });

    expect(Object.getPrototypeOf(request.query)).toBeNull();
  });
});
