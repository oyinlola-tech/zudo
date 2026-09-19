/**
 * Audit round 10 phase 2 regressions for @zudojs/http: shared error classes
 * (CONV-02), cookie compare through @zudojs/crypto (HTTP-11), the redacting
 * default context logger (events H6) and rate limiting a request with no
 * client address.
 */

import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import { afterEach, describe, it, expect, vi } from "vitest";
import * as crypto from "@zudojs/crypto";
import * as errors from "@zudojs/errors";

import * as http from "../src/index.js";

vi.mock("@zudojs/crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@zudojs/crypto")>();
  return { ...actual, timingSafeEqualString: vi.fn(actual.timingSafeEqualString) };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("edge/CONV-02 (phase 2): http errors are the @zudojs/errors classes", () => {
  it("re-exports the shared guard and middleware errors", () => {
    expect(http.HttpRequestGuardError).toBe(errors.HttpRequestGuardError);
    expect(http.HttpMiddlewareError).toBe(errors.HttpMiddlewareError);
    expect(http.HttpMiddlewarePipelineError).toBe(errors.HttpMiddlewarePipelineError);
  });

  it("assertRequestAllowed throws a non-exposed BaseError with the guard status", () => {
    let thrown: unknown;
    try {
      http.assertRequestAllowed({ method: "GET", url: "/a\r\nb", headers: {} });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(errors.BaseError);
    const guard = thrown as errors.HttpRequestGuardError;
    expect(guard.statusCode).toBe(400);
    expect(guard.expose).toBe(false);
    expect(guard.code).toBe("HTTP_REQUEST_REJECTED");
    expect(guard.errors.length).toBeGreaterThan(0);
  });
});

describe("edge/HTTP-11 (phase 2): signed cookies compare through @zudojs/crypto", () => {
  it("verifies with timingSafeEqualString and still rejects a forgery", () => {
    const secret = "a-cookie-secret-of-reasonable-length";
    const cookie = http.serializeSignedCookie("sid", "abc", { secret });
    const value = decodeURIComponent(cookie.split(";")[0]!.slice("sid=".length));
    const spy = vi.mocked(crypto.timingSafeEqualString);
    spy.mockClear();
    expect(http.parseSignedCookie(value, secret, "sid")).toBe("abc");
    expect(http.parseSignedCookie(`abd${value.slice(3)}`, secret, "sid")).toBeUndefined();
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe("events/H6: the stock adapters' default logger redacts", () => {
  it("ctx.logger never prints a secret from metadata", () => {
    const lines: string[] = [];
    for (const method of ["log", "info", "warn", "error", "debug"] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        lines.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
      });
    }
    const request = new IncomingMessage(new Socket());
    const ctx = http.adaptNodeContext(request, new ServerResponse(request));
    ctx.logger.info("login attempt", { authorization: "Bearer s3cr3t-token", password: "hunter2" });
    ctx.logger.error("failed", { apiKey: "hunter2" });
    const output = lines.join("\n");
    expect(output).toContain("login attempt");
    expect(output).not.toContain("s3cr3t-token");
    expect(output).not.toContain("hunter2");
  });
});

describe("security/rate-limit integration: a request with no client address", () => {
  const run = (pipeline: http.HttpMiddlewarePipeline, remoteAddress?: string) =>
    pipeline.execute(
      http.createRequestContext({ method: "GET", url: "/", remoteAddress }),
      http.createResponseContext(),
    );

  it("is limited in a shared bucket instead of failing with a 500", async () => {
    const pipeline = new http.HttpMiddlewarePipeline();
    pipeline.use(http.createRateLimitMiddleware({ max: 2, windowMs: 60_000 }));
    pipeline.use(async () => http.createResponseContext().text("ok"));

    expect((await run(pipeline)).status).toBe(200);
    expect((await run(pipeline, "not-an-ip")).status).toBe(200);
    expect((await run(pipeline)).status).toBe(429);
    expect((await run(pipeline, "")).status).toBe(429);
    expect((await run(pipeline, "203.0.113.9")).status).toBe(200);
  });

  it("uses the shared bucket with a pre-built limiter too", async () => {
    const pipeline = new http.HttpMiddlewarePipeline();
    const limiter = (await import("@zudojs/security")).createRateLimiter({
      max: 1,
      windowMs: 60_000,
    });
    pipeline.use(http.createRateLimitMiddleware({ limiter }));
    pipeline.use(async () => http.createResponseContext().text("ok"));

    expect((await run(pipeline)).status).toBe(200);
    expect((await run(pipeline)).status).toBe(429);
    expect(limiter.getCount(http.UNKNOWN_CLIENT_RATE_LIMIT_IP)).toBe(1);
  });
});
