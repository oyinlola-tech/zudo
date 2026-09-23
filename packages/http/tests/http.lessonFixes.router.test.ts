/**
 * Regressions reported by lesson writers against the published package:
 * route handlers returning plain values, route params in route middleware,
 * the rate limiter's 429, original errors through the middleware pipeline,
 * typed `createHttpServer` options and default `HttpError` codes.
 */

import { describe, it, expect } from "vitest";

import { NotFoundError } from "@zudojs/errors";

import * as http from "../src/index.js";

import { createRouteMatcher } from "../src/httpRouter/matching/httpRoute.matcher.js";

import { RouteDispatcher } from "../src/httpRouter/dispatch/httpRoute.dispatcher.js";

const get = (url: string) => http.createRequestContext({ method: "GET", url });

describe("route handlers returning plain values", () => {
  it("sends a plain object as a 200 JSON response", async () => {
    const router = http.createRouter();
    router.get("/health", () => ({ status: "ok" }));
    router.get("/names", async () => ["a", "b"]);

    const { response } = await router.dispatch(get("/health"));
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("application/json");
    expect(JSON.parse(String(response.body))).toEqual({ status: "ok" });

    const names = await router.dispatch(get("/names"));
    expect(JSON.parse(String(names.response.body))).toEqual(["a", "b"]);
  });

  it("keeps undefined and null as 204 and a response context as built", async () => {
    const router = http.createRouter();
    router.get("/none", () => undefined);
    router.get("/null", () => null);
    router.get("/built", () => http.createResponseContext().setStatus(201).text("made"));

    expect((await router.dispatch(get("/none"))).response.status).toBe(204);
    expect((await router.dispatch(get("/null"))).response.status).toBe(204);
    const built = (await router.dispatch(get("/built"))).response;
    expect([built.status, built.body]).toEqual([201, "made"]);
  });

  it("does the same through the RouteDispatcher", async () => {
    const router = new http.HttpRouter();
    router.get("/health", () => ({ status: "ok" }));
    const response = http.createResponseContext();

    await new RouteDispatcher(createRouteMatcher(router)).dispatch(get("/health"), response);

    expect(response.status).toBe(200);
    expect(JSON.parse(String(response.body))).toEqual({ status: "ok" });
  });
});

describe("route params in route middleware", () => {
  const ownerOnly: http.HttpMiddleware = async (context, next) => {
    if (context.request.getParam("id") !== "42") {
      return http.createResponseContext().setStatus(403);
    }
    return next();
  };

  it("are set on the request before route middleware runs", async () => {
    const router = http.createRouter();
    router.get("/posts/:id", (ctx) => ({ id: ctx.params["id"] }), { middleware: [ownerOnly] });

    const allowed = await router.dispatch(get("/posts/42"));
    expect(allowed.response.status).toBe(200);
    expect(JSON.parse(String(allowed.response.body))).toEqual({ id: "42" });
    expect((await router.dispatch(get("/posts/7"))).response.status).toBe(403);
  });

  it("are set through the RouteDispatcher too", async () => {
    const router = new http.HttpRouter();
    const seen: unknown[] = [];
    router.get("/posts/:id", () => undefined, {
      middleware: [
        async (context, next) => {
          seen.push(context.request.getParam("id"));
          return next();
        },
      ],
    });

    await new RouteDispatcher(createRouteMatcher(router)).dispatch(
      get("/posts/9"),
      http.createResponseContext(),
    );

    expect(seen).toEqual(["9"]);
  });
});

describe("rate limit rejection", () => {
  const run = async (middleware: http.HttpMiddleware) => {
    const pipeline = new http.HttpMiddlewarePipeline();
    pipeline.use(middleware);
    pipeline.use(async () => http.createResponseContext().text("ok"));
    const request = () =>
      pipeline.execute(
        http.createRequestContext({ method: "GET", url: "/", remoteAddress: "1.2.3.4" }),
        http.createResponseContext(),
      );
    await request();
    return request();
  };

  it("sends the JSON body as application/json with Retry-After", async () => {
    const limited = await run(http.createRateLimitMiddleware({ max: 1, windowMs: 60_000 }));
    expect(limited.status).toBe(429);
    expect(limited.headers["content-type"]).toBe("application/json; charset=utf-8");
    expect(Number(limited.headers["retry-after"])).toBeGreaterThan(0);
    expect(JSON.parse(String(limited.body))).toMatchObject({
      error: { code: "RATE_LIMIT_EXCEEDED" },
    });
  });

  it("adds Retry-After when a custom handler leaves it out", async () => {
    const limited = await run(
      http.createRateLimitMiddleware({
        max: 1,
        windowMs: 60_000,
        handler: (_request, response) => {
          response.statusCode = 429;
          response.body = "slow down";
        },
      }),
    );
    expect(Number(limited.headers["retry-after"])).toBeGreaterThan(0);
    expect(limited.headers["content-type"]).toBe("text/plain; charset=utf-8");
  });
});

describe("errors through the middleware pipeline", () => {
  it("reach an outer middleware and the caller as the thrown error", async () => {
    const seen: unknown[] = [];
    const pipeline = new http.HttpMiddlewarePipeline();
    pipeline.use(async (_context, next) => {
      try {
        return await next();
      } catch (error) {
        seen.push(error);
        throw error;
      }
    });
    pipeline.use(async () => {
      throw new NotFoundError("post 42");
    });

    const failure = await pipeline
      .execute(get("/"), http.createResponseContext())
      .catch((error: unknown) => error);

    expect(seen[0]).toBeInstanceOf(NotFoundError);
    expect(failure).toBeInstanceOf(NotFoundError);
    expect(failure).toBe(seen[0]);
  });

  it("reach onError as the thrown error", async () => {
    const thrown = new NotFoundError("post 1");
    const pipeline = new http.HttpMiddlewarePipeline({
      onError: (error) => http.createResponseContext().setStatus(error === thrown ? 404 : 500),
    });
    pipeline.use(async () => {
      throw thrown;
    });

    expect((await pipeline.execute(get("/"), http.createResponseContext())).status).toBe(404);
  });
});

describe("createHttpServer options", () => {
  it("infer the handler's request as HttpRequestContext", () => {
    const server = http.createHttpServer({
      adapter: http.createNodeHttpAdapter({ host: "127.0.0.1", port: 0 }),
      handler: async (request) => http.createResponseContext().text(request.path),
      errorHandler: (error, request) => ({ error: String(error), path: request.path }),
    });
    expect(server.state).toBe("created");
  });
});

describe("HttpError default code", () => {
  it("is derived from the status when no code is given", () => {
    expect(new http.HttpError(415, "no xml").code).toBe("UNSUPPORTED_MEDIA_TYPE");
    expect(new http.HttpError(404).code).toBe("NOT_FOUND");
    expect(new http.HttpError(503).code).toBe("SERVICE_UNAVAILABLE");
    expect(new http.HttpError(415, "x", { code: "MINE" }).code).toBe("MINE");
    expect(http.notFound().code).toBe("NOT_FOUND");
  });
});

describe("request guard and x-request-id agree", () => {
  it("accepts the ids the adapter reuses, such as trace ids with dots and colons", async () => {
    const { DEFAULT_SECURITY_CONFIG } = await import("../src/index.js");
    expect(DEFAULT_SECURITY_CONFIG.requestIdPattern.test("svc.a:123")).toBe(true);
    expect(DEFAULT_SECURITY_CONFIG.requestIdPattern.test("bad id")).toBe(false);
  });
});
