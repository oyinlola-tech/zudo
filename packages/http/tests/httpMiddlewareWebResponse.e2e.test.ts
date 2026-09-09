/**
 * End-to-end tests for middleware that return a plain web `Response`, and for
 * the status/body retention of the built-in header middleware.
 *
 * `HttpMiddlewareResult` has always permitted a `Response`, but both
 * middleware normalizers fabricated `{ response } as unknown as
 * ResponseContext` for one — an object with no `status`, `headers` or `body`.
 * The adapter read all three as `undefined`, so the response reached the
 * client empty. Nothing short of a real server proves the repair, because the
 * fabricated object type-checked everywhere in between.
 */

import { describe, it, expect, afterEach } from "vitest";

import { createNodeHttpAdapter } from "../src/httpAdapter/node/httpNode.adapter.js";
import type { NodeHttpAdapter } from "../src/httpAdapter/node/httpNode.adapter.js";
import { createResponseContext } from "../src/httpResponse/httpResponse.context.js";
import { HttpMiddlewarePipeline } from "../src/httpMiddleware/pipeline/httpMiddleware.pipeline.js";
import type { HttpMiddleware } from "../src/httpMiddleware/httpMiddleware.type.js";
import { createCorsMiddleware } from "../src/httpMiddleware/builtin/cors/httpMiddleware.cors.js";
import { createSecurityMiddleware } from "../src/httpMiddleware/builtin/security/httpMiddleware.security.js";
import { createTimingMiddleware } from "../src/httpMiddleware/builtin/timing/httpMiddleware.timing.js";
import {
  createResponseMiddleware,
  createShortCircuitMiddleware,
} from "../src/httpMiddleware/builtin/conditional/httpMiddleware.conditional.js";
import { normalizeResult } from "../src/httpMiddleware/pipeline/httpPipeline.helper.js";
import { HttpMiddlewareError } from "../src/httpMiddleware/httpMiddleware.error.js";
import { createRequestContext } from "../src/httpRequest/httpRequest.context.js";

const started: NodeHttpAdapter[] = [];

/**
 * Starts a real server on an ephemeral port whose handler runs `middlewares`
 * through the real pipeline.
 */
async function startPipelineServer(
  middlewares: readonly HttpMiddleware[],
): Promise<string> {
  const pipeline = new HttpMiddlewarePipeline();

  for (const middleware of middlewares) {
    pipeline.use(middleware);
  }

  const adapter = createNodeHttpAdapter({
    host: "127.0.0.1",
    /* Port 0 asks the OS for an ephemeral port. */
    port: 0,
    handler: async (request) =>
      pipeline.execute(request, createResponseContext()),
  });

  await adapter.start();

  started.push(adapter);

  const address = adapter.address;

  if (!address) {
    throw new Error("adapter did not report a listening address");
  }

  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  while (started.length > 0) {
    const adapter = started.pop();

    if (adapter) {
      await adapter.stop();
    }
  }
});

describe("middleware returning a plain web Response, end to end", () => {
  it("delivers its status, headers and body to a real client", async () => {
    const origin = await startPipelineServer([
      async () =>
        new Response(JSON.stringify({ ok: true, from: "web-response" }), {
          status: 418,
          headers: {
            "content-type": "application/json",
            "x-from-middleware": "yes",
          },
        }),
    ]);

    const response = await fetch(`${origin}/teapot`);

    expect(response.status).toBe(418);
    expect(response.headers.get("x-from-middleware")).toBe("yes");
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual({
      ok: true,
      from: "web-response",
    });
  });

  it("streams a Response built from a ReadableStream without buffering it", async () => {
    const origin = await startPipelineServer([
      async () => {
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("chunk-one:"));
            controller.enqueue(new TextEncoder().encode("chunk-two"));
            controller.close();
          },
        });

        return new Response(stream, {
          status: 200,
          headers: { "content-type": "text/plain" },
        });
      },
    ]);

    const response = await fetch(`${origin}/stream`);

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("chunk-one:chunk-two");
  });

  it("keeps multiple Set-Cookie values separate", async () => {
    const origin = await startPipelineServer([
      async () => {
        const headers = new Headers();

        headers.append("set-cookie", "a=1; Path=/");
        headers.append("set-cookie", "b=2; Path=/");

        return new Response("cookies", { status: 200, headers });
      },
    ]);

    const response = await fetch(`${origin}/cookies`);

    expect(response.headers.getSetCookie()).toEqual([
      "a=1; Path=/",
      "b=2; Path=/",
    ]);
    await expect(response.text()).resolves.toBe("cookies");
  });

  it("survives the built-in header middleware stack unchanged", async () => {
    /*
     * Regression for the eight spread sites: timing, security and CORS each
     * used to return `{ ...response, headers }`, which dropped the status and
     * body of whatever they wrapped.
     */
    const origin = await startPipelineServer([
      createTimingMiddleware(),
      createSecurityMiddleware(),
      createCorsMiddleware({ allowOrigin: ["https://good.example"] }),
      async () =>
        new Response("payload-through-the-stack", {
          status: 203,
          headers: { "content-type": "text/plain" },
        }),
    ]);

    const response = await fetch(`${origin}/wrapped`, {
      headers: { origin: "https://good.example" },
    });

    expect(response.status).toBe(203);
    await expect(response.text()).resolves.toBe("payload-through-the-stack");

    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://good.example",
    );
    expect(response.headers.get("vary")).toContain("Origin");
    expect(response.headers.get("server-timing")).toBeTruthy();
  });

  it("keeps a response context's status and body through the same stack", async () => {
    const origin = await startPipelineServer([
      createTimingMiddleware(),
      createSecurityMiddleware(),
      createCorsMiddleware({ allowOrigin: "*" }),
      async () => createResponseContext().setStatus(207).text("ctx-body"),
    ]);

    const response = await fetch(`${origin}/ctx`, {
      headers: { origin: "https://any.example" },
    });

    expect(response.status).toBe(207);
    await expect(response.text()).resolves.toBe("ctx-body");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("serves a reusable Response middleware on every request", async () => {
    /*
     * `createResponseMiddleware` holds one `Response` for the lifetime of the
     * process. Its body is a one-shot stream, so it is buffered once and
     * cloned per request; without that the second request would receive a
     * disturbed stream.
     */
    const origin = await startPipelineServer([
      createResponseMiddleware(
        new Response("static-payload", {
          status: 503,
          headers: { "retry-after": "30" },
        }),
      ),
    ]);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await fetch(`${origin}/down`);

      expect(response.status).toBe(503);
      expect(response.headers.get("retry-after")).toBe("30");
      await expect(response.text()).resolves.toBe("static-payload");
    }
  });

  it("short-circuits with a reusable Response and otherwise continues", async () => {
    const origin = await startPipelineServer([
      createShortCircuitMiddleware(
        (context) =>
          new URL(context.request.url, "http://x").pathname === "/no",
        new Response("blocked", { status: 403 }),
      ),
      async () => createResponseContext().setStatus(200).text("allowed"),
    ]);

    const blocked = await fetch(`${origin}/no`);

    expect(blocked.status).toBe(403);
    await expect(blocked.text()).resolves.toBe("blocked");

    const blockedAgain = await fetch(`${origin}/no`);

    expect(blockedAgain.status).toBe(403);
    await expect(blockedAgain.text()).resolves.toBe("blocked");

    const allowed = await fetch(`${origin}/yes`);

    expect(allowed.status).toBe(200);
    await expect(allowed.text()).resolves.toBe("allowed");
  });
});

describe("normalizeResult", () => {
  it("converts a web Response rather than passing it through", () => {
    const context = normalizeResult(
      new Response("hi", { status: 202, headers: { "x-a": "b" } }),
    );

    /*
     * `"headers" in someResponse` is true (it is a prototype getter), so the
     * structural response-context test used to swallow every `Response`
     * before the conversion branch could run.
     */
    expect(context.status).toBe(202);
    expect(context.headers["x-a"]).toBe("b");
    expect(context.body).not.toBeUndefined();
  });

  it("returns the ambient response for a request context", () => {
    const fallback = createResponseContext().setStatus(200).text("ambient");

    const request = createRequestContext({
      method: "GET",
      url: "/",
      headers: {},
    });

    expect(normalizeResult(request, fallback)).toBe(fallback);
  });

  it("refuses to invent a response for a request context with no fallback", () => {
    const request = createRequestContext({
      method: "GET",
      url: "/",
      headers: {},
    });

    expect(() => normalizeResult(request)).toThrow(HttpMiddlewareError);
  });

  it("refuses a Response whose body has already been consumed", async () => {
    const response = new Response("gone");

    await response.text();

    expect(() => normalizeResult(response)).toThrow(TypeError);
  });
});
