/**
 * Audit round 10 regression tests: proxy paths, trust proxy, signed cookies,
 * CORS construction, rate limiting and the server counter (HTTP-06, HTTP-08,
 * HTTP-11, HTTP-13, HTTP-14, HTTP-16).
 */

import { describe, it, expect } from "vitest";

import * as http from "../src/index.js";

import { sendRaw } from "./round10.harness.js";

describe("HTTP-06", () => {
  const target = { target: "http://10.0.0.5:8080/public-api", allowPrivateTargets: true };

  it("refuses paths that would leave the target's base path", () => {
    for (const path of ["/../admin/keys", "/%2e%2e/admin/keys", "/..%2fadmin", "/a/%2E%2E/%2e%2e/x"]) {
      expect(() => http.createProxyRequest("GET", path, [], target), path).toThrow(/dot segment/);
    }

    expect(() => http.resolveProxyURL("http://up/public-api", "/../admin")).toThrow();
  });

  it("still joins ordinary paths under the base", () => {
    expect(http.createProxyRequest("GET", "/users/1", [], target).path).toBe("/public-api/users/1");
    expect(http.resolveProxyURL("http://up/public-api", "/a..b").pathname).toBe("/public-api/a..b");
  });
});

describe("HTTP-08", () => {
  const request = (xff: string) => ({
    headers: { "x-forwarded-for": xff },
    socket: { remoteAddress: "127.0.0.1" },
  });

  it("trusts exactly N hops for a numeric trustProxy", () => {
    expect(http.getClientIp(request("6.6.6.6, 9.9.9.9"), 1)).toBe("9.9.9.9");
    expect(http.getClientIp(request("6.6.6.6, 9.9.9.9"), 2)).toBe("6.6.6.6");
    expect(http.getClientIp(request("6.6.6.6, 9.9.9.9"), 0)).toBe("127.0.0.1");
  });

  it("rejects a malformed hop count at adapter construction", () => {
    expect(() => http.createNodeHttpAdapter({ trustProxy: -1 })).toThrow(TypeError);
  });
});

describe("HTTP-11", () => {
  it("binds a signed cookie to its name", () => {
    const header = http.serializeSignedCookie("display_name", "admin", { secret: "s" });
    const value = decodeURIComponent(header.split(";")[0]!.split("=").slice(1).join("="));

    expect(http.parseSignedCookie(value, "s", "display_name")).toBe("admin");
    expect(http.parseSignedCookie(value, "s", "session_user")).toBeUndefined();
    expect(http.parseSignedCookie(value, "s")).toBeUndefined();
  });
});

describe("HTTP-16", () => {
  it("rejects wildcard + credentials when the middleware is created", () => {
    expect(() => http.createCorsMiddleware({ credentials: true })).toThrow(/wildcard/);
    expect(() =>
      http.createCorsMiddleware({ credentials: true, allowOrigin: ["https://a.example"] }),
    ).not.toThrow();
  });
});

describe("HTTP-13", () => {
  it("rate limits through @zudojs/security", async () => {
    const pipeline = new http.HttpMiddlewarePipeline();

    pipeline.use(http.createRateLimitMiddleware({ max: 1, windowMs: 60_000 }));
    pipeline.use(async () => http.createResponseContext().text("ok"));

    const run = () =>
      pipeline.execute(
        http.createRequestContext({ method: "GET", url: "/", remoteAddress: "1.2.3.4" }),
        http.createResponseContext(),
      );

    expect((await run()).status).toBe(200);

    const limited = await run();

    expect(limited.status).toBe(429);
    expect(limited.headers["retry-after"]).toBeDefined();
  });
});

describe("HTTP-14", () => {
  it("counts requests and fires onRequest/onResponse", async () => {
    const server = http.createHttpServer({
      adapter: http.createNodeHttpAdapter({ host: "127.0.0.1", port: 0 }),
      handler: () => "ok",
    });

    let events = 0;

    server.on("onRequest", () => { events += 1; });
    server.on("onResponse", () => { events += 1; });

    await server.start();

    try {
      const port = server.address?.port ?? 0;

      for (let i = 0; i < 3; i += 1) {
        expect((await sendRaw(port, "/")).status).toBe(200);
      }

      expect(server.snapshot().requests).toBe(3);
      expect(events).toBe(6);
    } finally {
      await server.stop();
    }
  });
});
