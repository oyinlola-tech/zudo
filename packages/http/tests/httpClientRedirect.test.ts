/**
 * Client redirect, defaults and retry tests.
 *
 * Covers HTTPB-18 (client defaults never applied), the cross-origin redirect
 * credential leak, HTTPB-28 (non-idempotent retry) and HTTPB-48 (jitter
 * escaping maxRetryDelay).
 */

import { describe, it, expect } from "vitest";

/**
 * A synthetic Response has an empty `url`, which the client's response
 * parser needs. Stamp it so these tests exercise the real code path.
 */
function withUrl(response: Response, url: string): Response {
  Object.defineProperty(response, "url", { value: url });

  return response;
}

import { HttpClient } from "../src/httpClient/httpClient.client.js";
import {
  calculateRetryDelay,
  shouldRetryError,
} from "../src/httpClient/httpClient.retry.js";

function redirectingFetch(seen: Request[]): typeof globalThis.fetch {
  return (async (input: Request | string | URL) => {
    const request =
      input instanceof Request ? input : new Request(String(input));

    seen.push(request);

    if (new URL(request.url).host === "origin.example") {
      return withUrl(
        new Response(null, {
          status: 302,
          headers: { location: "https://evil.example/steal" },
        }),
        request.url,
      );
    }

    return withUrl(
      new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
      request.url,
    );
  }) as typeof globalThis.fetch;
}

describe("HttpClient redirects", () => {
  it("drops Authorization when a redirect crosses origins", async () => {
    const seen: Request[] = [];

    const client = new HttpClient({
      fetch: redirectingFetch(seen),
      headers: { authorization: "Bearer super-secret", cookie: "sid=abc" },
    });

    await client.request("https://origin.example/start");

    expect(seen).toHaveLength(2);

    const first = seen[0];
    const second = seen[1];

    expect(first?.headers.get("authorization")).toBe("Bearer super-secret");

    expect(new URL(second?.url ?? "").host).toBe("evil.example");
    expect(second?.headers.get("authorization")).toBeNull();
    expect(second?.headers.get("cookie")).toBeNull();
  });

  it("keeps Authorization on a same-origin redirect", async () => {
    const seen: Request[] = [];

    const fetchImpl = (async (input: Request | string | URL) => {
      const request =
        input instanceof Request ? input : new Request(String(input));

      seen.push(request);

      if (new URL(request.url).pathname === "/start") {
        return withUrl(
          new Response(null, {
            status: 302,
            headers: { location: "https://origin.example/final" },
          }),
          request.url,
        );
      }

      return withUrl(
        new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
        request.url,
      );
    }) as typeof globalThis.fetch;

    const client = new HttpClient({
      fetch: fetchImpl,
      headers: { authorization: "Bearer keep-me" },
    });

    await client.request("https://origin.example/start");

    expect(seen[1]?.headers.get("authorization")).toBe("Bearer keep-me");
  });

  it("refuses to follow a redirect to a non-HTTP scheme", async () => {
    const fetchImpl = (async () =>
      withUrl(
        new Response(null, {
          status: 302,
          headers: { location: "javascript:alert(1)" },
        }),
        "https://origin.example/start",
      )) as typeof globalThis.fetch;

    const client = new HttpClient({ fetch: fetchImpl });

    await expect(
      client.request("https://origin.example/start"),
    ).rejects.toMatchObject({ code: "HTTP_CLIENT_UNSAFE_REDIRECT" });
  });

  it("applies client-level defaults to the outgoing request (HTTPB-18)", async () => {
    let seen: Request | undefined;

    const fetchImpl = (async (input: Request | string | URL) => {
      seen = input instanceof Request ? input : new Request(String(input));

      return withUrl(
        new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
        seen.url,
      );
    }) as typeof globalThis.fetch;

    const client = new HttpClient({
      fetch: fetchImpl,
      redirect: "manual",
      credentials: "omit",
      integrity: "sha384-abc",
    });

    await client.request("https://origin.example/x");

    expect(seen?.redirect).toBe("manual");
    expect(seen?.credentials).toBe("omit");
    expect(seen?.integrity).toBe("sha384-abc");
  });

  it("lets a per-request config override a client default", async () => {
    let seen: Request | undefined;

    const fetchImpl = (async (input: Request | string | URL) => {
      seen = input instanceof Request ? input : new Request(String(input));

      return withUrl(
        new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
        seen.url,
      );
    }) as typeof globalThis.fetch;

    const client = new HttpClient({ fetch: fetchImpl, redirect: "manual" });

    await client.request("https://origin.example/x", { redirect: "error" });

    expect(seen?.redirect).toBe("error");
  });
});

describe("HttpClient retry policy", () => {
  const retry = {
    retries: 3,
    retryDelay: 1000,
    maxRetryDelay: 2000,
    retryStatusCodes: [503],
    retryMethods: ["GET", "HEAD", "OPTIONS"] as const,
    retryOnNetworkError: true,
    backoff: "exponential" as const,
  };

  it("does not replay a POST after a network failure (HTTPB-28)", () => {
    const error = new TypeError("fetch failed");

    expect(shouldRetryError(error, "POST", retry)).toBe(false);
    expect(shouldRetryError(error, "GET", retry)).toBe(true);
  });

  it("does not treat a consumed body as a retryable network error", () => {
    const error = new TypeError("Request body is already used");

    expect(shouldRetryError(error, "GET", retry)).toBe(false);
  });

  it("never exceeds maxRetryDelay, jitter included (HTTPB-48)", () => {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      expect(calculateRetryDelay(attempt, retry)).toBeLessThanOrEqual(2000);
    }

    for (let i = 0; i < 50; i += 1) {
      expect(
        calculateRetryDelay(0, { ...retry, backoff: "fixed" }),
      ).toBeLessThanOrEqual(2000);
    }
  });
});
