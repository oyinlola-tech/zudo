/**
 * Middleware pipeline, interceptor registry and built-in middleware tests.
 *
 * Covers HTTPB-14 (priority/enabled discarded), HTTPB-15 (onError recovery
 * discarded, inner failure resuming outer frames), HTTPB-16 (id reuse
 * overwriting a live interceptor), HTTPB-17 (unenforced manager limits),
 * HTTPB-08 (CORS middleware) and HTTPB-30 (security middleware).
 */

import { describe, it, expect } from "vitest";

import { HttpMiddlewarePipeline } from "../src/httpMiddleware/pipeline/httpMiddleware.pipeline.js";
import { HttpInterceptorManager } from "../src/httpInterceptors/manager/httpInterceptor.manager.js";
import { createCorsMiddleware } from "../src/httpMiddleware/builtin/cors/httpMiddleware.cors.js";
import { createSecurityMiddleware } from "../src/httpMiddleware/builtin/security/httpMiddleware.security.js";
import type {
  HttpMiddlewareContext,
  HttpMiddleware,
} from "../src/httpMiddleware/httpMiddleware.type.js";
import type { HttpResponseContext } from "../src/httpResponse/httpResponse.context.js";
import { createResponseContext } from "../src/httpResponse/httpResponse.context.js";
import { createRequestContext } from "../src/httpRequest/httpRequest.context.js";

function request(init: Record<string, unknown> = {}) {
  return createRequestContext({
    method: "GET",
    url: "/",
    headers: {},
    ...init,
  });
}

describe("HttpMiddlewarePipeline registration", () => {
  it("honours priority ordering (HTTPB-14)", async () => {
    const order: string[] = [];

    const pipeline = new HttpMiddlewarePipeline();

    const mark =
      (name: string): HttpMiddleware =>
      async (_context, next) => {
        order.push(name);

        return next();
      };

    pipeline.use(mark("logging"), { priority: 10, name: "logging" });
    pipeline.use(mark("auth"), { priority: -100, name: "auth" });

    await pipeline.execute(request(), createResponseContext());

    expect(order).toEqual(["auth", "logging"]);
  });

  it("keeps registration order when priorities tie", async () => {
    const order: string[] = [];

    const pipeline = new HttpMiddlewarePipeline();

    for (const name of ["a", "b", "c"]) {
      pipeline.use(async (_context, next) => {
        order.push(name);

        return next();
      });
    }

    await pipeline.execute(request(), createResponseContext());

    expect(order).toEqual(["a", "b", "c"]);
  });

  it("honours enabled: false at registration time (HTTPB-14)", async () => {
    let ran = false;

    const pipeline = new HttpMiddlewarePipeline();

    pipeline.use(
      async (_context, next) => {
        ran = true;

        return next();
      },
      { enabled: false },
    );

    await pipeline.execute(request(), createResponseContext());

    expect(ran).toBe(false);
  });
});

describe("HttpMiddlewarePipeline execution", () => {
  it("returns the onError recovery result (HTTPB-15)", async () => {
    const recovered = createResponseContext().setStatus(422);

    const pipeline = new HttpMiddlewarePipeline({
      onError: () => recovered,
    });

    pipeline.use(async () => {
      throw new Error("domain failure");
    });

    const result = await pipeline.execute(request(), createResponseContext());

    expect(result.status).toBe(422);
  });

  it("does not resume outer middleware after an inner failure (HTTPB-15)", async () => {
    const afterNext: string[] = [];

    const pipeline = new HttpMiddlewarePipeline();

    pipeline.use(async (_context, next) => {
      const response = await next();

      afterNext.push("outer");

      return response;
    });

    pipeline.use(async () => {
      throw new Error("inner failure");
    });

    await expect(
      pipeline.execute(request(), createResponseContext()),
    ).rejects.toThrow();

    expect(afterNext).toEqual([]);
  });

  it("reports the error handler's own failure rather than swallowing it", async () => {
    const pipeline = new HttpMiddlewarePipeline({
      onError: () => {
        throw new Error("handler exploded");
      },
    });

    pipeline.use(async () => {
      throw new Error("inner");
    });

    await expect(
      pipeline.execute(request(), createResponseContext()),
    ).rejects.toMatchObject({
      errors: expect.arrayContaining([
        expect.objectContaining({
          message: "HTTP middleware error handler threw an error.",
        }),
      ]),
    });
  });

  it("rejects a middleware that calls next() twice", async () => {
    const pipeline = new HttpMiddlewarePipeline();

    pipeline.use(async (_context, next) => {
      await next();

      return next();
    });

    await expect(
      pipeline.execute(request(), createResponseContext()),
    ).rejects.toThrow(/next\(\) more than once/);
  });
});

describe("HttpInterceptorManager", () => {
  it("never reuses an id after an unregister (HTTPB-16)", () => {
    const manager = new HttpInterceptorManager<string>();

    const auth = manager.register("auth");
    const audit = manager.register("audit");

    expect(manager.unregister(auth)).toBe(true);

    const logging = manager.register("logging");

    expect(logging).not.toBe(audit);
    expect(manager.get(audit)?.handler).toBe("audit");
    expect(manager.get(logging)?.handler).toBe("logging");
  });

  it("enforces maxInterceptors (HTTPB-17)", () => {
    const manager = new HttpInterceptorManager<string>({ maxInterceptors: 2 });

    manager.register("a");
    manager.register("b");

    expect(() => manager.register("c")).toThrow(RangeError);
  });

  it("enforces allowDuplicateNames: false (HTTPB-17)", () => {
    const manager = new HttpInterceptorManager<string>({
      allowDuplicateNames: false,
    });

    manager.register("first", { name: "auth" });

    expect(() => manager.register("second", { name: "auth" })).toThrow(
      /already registered/,
    );
  });

  it("permits duplicate names when configured to", () => {
    const manager = new HttpInterceptorManager<string>({
      allowDuplicateNames: true,
    });

    manager.register("first", { name: "auth" });

    expect(() => manager.register("second", { name: "auth" })).not.toThrow();
  });
});

describe("built-in CORS middleware", () => {
  function contextFor(
    headers: Record<string, string>,
    method = "GET",
  ): HttpMiddlewareContext {
    return {
      request: { method, url: "http://api.example/x", headers },
      response: { headers: {} },
      state: new Map(),
      signal: new AbortController().signal,
      metadata: {},
    } as unknown as HttpMiddlewareContext;
  }

  const passthrough = async () =>
    ({ status: 200, headers: {} }) as unknown as HttpResponseContext;

  it("does nothing on a request with no Origin (HTTPB-08)", async () => {
    const middleware = createCorsMiddleware({ allowOrigin: "*" });

    const result = (await middleware(
      contextFor({}),
      passthrough,
    )) as unknown as { headers?: unknown };

    /* The downstream response is returned untouched: no Headers rewrite. */
    expect(result.headers).not.toBeInstanceOf(Headers);
  });

  it("does not allow an unlisted origin", async () => {
    const middleware = createCorsMiddleware({
      allowOrigin: ["https://good.example"],
    });

    const result = (await middleware(
      contextFor({ origin: "https://evil.example" }),
      passthrough,
    )) as unknown as { headers: Headers };

    expect(result.headers.get("access-control-allow-origin")).toBeNull();
    expect(result.headers.get("vary")).toContain("Origin");
  });

  it("always emits Vary: Origin (HTTPB-08)", async () => {
    const middleware = createCorsMiddleware({
      allowOrigin: ["https://good.example"],
    });

    const result = (await middleware(
      contextFor({ origin: "https://good.example" }),
      passthrough,
    )) as unknown as { headers: Headers };

    expect(result.headers.get("access-control-allow-origin")).toBe(
      "https://good.example",
    );
    expect(result.headers.get("vary")).toContain("Origin");
  });

  it("refuses a wildcard origin combined with credentials", async () => {
    const middleware = createCorsMiddleware({
      allowOrigin: "*",
      credentials: true,
    });

    await expect(
      middleware(contextFor({ origin: "https://evil.example" }), passthrough),
    ).rejects.toThrow(TypeError);
  });

  it("answers a preflight without calling downstream (HTTPB-08)", async () => {
    let called = false;

    const middleware = createCorsMiddleware({
      allowOrigin: ["https://good.example"],
      allowMethods: "GET, POST",
    });

    const result = (await middleware(
      contextFor(
        {
          origin: "https://good.example",
          "access-control-request-method": "POST",
        },
        "OPTIONS",
      ),
      async () => {
        called = true;

        return passthrough();
      },
    )) as unknown as { status: number; headers: Headers };

    expect(called).toBe(false);
    expect(result.status).toBe(204);
    expect(result.headers.get("access-control-allow-methods")).toBe(
      "GET, POST",
    );
  });
});

describe("built-in security middleware", () => {
  const context = {
    request: { method: "GET", url: "http://x/", headers: {} },
    response: { headers: {} },
    state: new Map(),
    signal: new AbortController().signal,
    metadata: {},
  } as unknown as HttpMiddlewareContext;

  const passthrough = async () =>
    ({ status: 200, headers: {} }) as unknown as HttpResponseContext;

  it("emits sensible defaults with no options (HTTPB-30)", async () => {
    const result = (await createSecurityMiddleware()(
      context,
      passthrough,
    )) as unknown as { headers: Headers };

    expect(result.headers.get("x-content-type-options")).toBe("nosniff");
    expect(result.headers.get("x-frame-options")).toBe("DENY");
    expect(result.headers.get("referrer-policy")).toBe(
      "strict-origin-when-cross-origin",
    );
  });

  it("rejects a header value carrying a CRLF payload (HTTPB-30)", () => {
    expect(() =>
      createSecurityMiddleware({ xFrameOptions: "DENY\r\nx-evil: 1" }),
    ).toThrow(TypeError);
  });
});
