/**
 * Regressions reported by lesson writers against the published package:
 * `request.id` from `x-request-id`, and client retries of timeouts with
 * jitter scaled to the configured delay.
 */

import { afterEach, describe, expect, it } from "vitest";

import * as http from "../src/index.js";

import type { NodeHttpAdapter } from "../src/httpAdapter/node/httpNode.adapter.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

const started: NodeHttpAdapter[] = [];

afterEach(async () => {
  while (started.length > 0) await started.pop()?.stop();
});

async function requestIdOf(
  headers: Record<string, string>,
  options: http.NodeAdapterOptions = {},
): Promise<string> {
  const adapter = http.createNodeHttpAdapter({
    host: "127.0.0.1",
    port: 0,
    handler: (request) => http.createResponseContext().text(request.id),
    ...options,
  });
  await adapter.start();
  started.push(adapter);
  const response = await fetch(`http://127.0.0.1:${adapter.address!.port}/`, { headers });
  return response.text();
}

describe("request.id and x-request-id", () => {
  it("reuses a well-formed incoming id", async () => {
    expect(await requestIdOf({ "x-request-id": "req_123-abc" })).toBe("req_123-abc");
  });

  it("accepts dots and colons when the guard allows them", async () => {
    const id = "svc.api:0042-a";
    expect(await requestIdOf({ "x-request-id": id }, { security: false })).toBe(id);
  });

  it("generates an id when the header is missing, malformed or too long", async () => {
    expect(await requestIdOf({})).toMatch(UUID);
    expect(await requestIdOf({ "x-request-id": "a b\"c" }, { security: false })).toMatch(UUID);
    expect(await requestIdOf({ "x-request-id": "x".repeat(129) }, { security: false })).toMatch(UUID);
  });

  it("can be told never to trust the header", async () => {
    expect(await requestIdOf({ "x-request-id": "req_1" }, { trustRequestId: false })).toMatch(UUID);
  });

  it("resolveIncomingRequestId bounds length and charset", () => {
    expect(http.resolveIncomingRequestId("abc:1.2_3-4")).toBe("abc:1.2_3-4");
    expect(http.resolveIncomingRequestId("x".repeat(128))).toHaveLength(128);
    expect(http.resolveIncomingRequestId("x".repeat(129))).toBeUndefined();
    expect(http.resolveIncomingRequestId("a, b")).toBeUndefined();
    expect(http.resolveIncomingRequestId("id\r\nx")).toBeUndefined();
    expect(http.resolveIncomingRequestId("")).toBeUndefined();
    expect(http.resolveIncomingRequestId(["a", "b"])).toBeUndefined();
  });
});

/** A fetch that never answers its first `hangs` calls, then answers 200. */
function hangingFetch(hangs: number): { readonly calls: () => number; readonly fetch: typeof fetch } {
  let calls = 0;
  const impl = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    calls += 1;
    const signal = input instanceof Request ? input.signal : init?.signal;
    if (calls > hangs) {
      const response = new Response("{\"ok\":true}", {
        headers: { "content-type": "application/json" },
      });
      const url = input instanceof Request ? input.url : String(input);
      Object.defineProperty(response, "url", { value: url });
      return Promise.resolve(response);
    }
    return new Promise((_resolve, reject) => {
      signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    });
  };
  return { calls: () => calls, fetch: impl as typeof fetch };
}

describe("HttpClient retries a timeout", () => {
  const retry = { retries: 2, retryDelay: 1 } as const;

  it("retries a GET that timed out", async () => {
    const fake = hangingFetch(1);
    const client = new http.HttpClient({ fetch: fake.fetch, timeout: 20, retry });

    const response = await client.request("http://api.example/items");

    expect(response.data).toEqual({ ok: true });
    expect(fake.calls()).toBe(2);
  });

  it("never retries a POST by default", async () => {
    const fake = hangingFetch(1);
    const client = new http.HttpClient({ fetch: fake.fetch, timeout: 20, retry });

    await expect(
      client.request("http://api.example/items", { method: "POST", body: "x" }),
    ).rejects.toBeInstanceOf(http.HttpClientTimeoutError);
    expect(fake.calls()).toBe(1);
  });

  it("does not retry a timeout with retryOnTimeout: false", async () => {
    const fake = hangingFetch(1);
    const client = new http.HttpClient({
      fetch: fake.fetch,
      timeout: 20,
      retry: { ...retry, retryOnTimeout: false },
    });

    await expect(client.request("http://api.example/items")).rejects.toBeInstanceOf(
      http.HttpClientTimeoutError,
    );
    expect(fake.calls()).toBe(1);
  });
});

describe("calculateRetryDelay", () => {
  it("scales jitter to the delay instead of adding up to a second", () => {
    for (let i = 0; i < 200; i += 1) {
      const wait = http.calculateRetryDelay(0, { retryDelay: 50, backoff: "fixed" });
      expect(wait).toBeGreaterThanOrEqual(0);
      expect(wait).toBeLessThanOrEqual(50);
    }
  });

  it("waits exactly the delay with jitter: false, capped by maxRetryDelay", () => {
    const retry = { retryDelay: 100, maxRetryDelay: 250, jitter: false } as const;
    expect([0, 1, 2].map((attempt) => http.calculateRetryDelay(attempt, retry))).toEqual([
      100, 200, 250,
    ]);
  });
});
