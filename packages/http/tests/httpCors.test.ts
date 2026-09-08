import { describe, expect, it } from "vitest";

import {
  canonicalizeOrigin,
  createCorsHeaders,
  createCorsPolicy,
  evaluateCors,
  evaluateCorsDecision,
  getCorsVaryHeaders,
  hasWildcardOrigin,
  matchesOrigin,
} from "../src/httpCors/index.js";

describe("origin matching", () => {
  it("ADVERSARIAL: a suffix/prefix lookalike must not pass", async () => {
    const allowed = ["https://example.com"];

    for (const evil of [
      "https://evil-example.com.attacker.com",
      "https://example.com.attacker.com",
      "https://example.como",
      "https://notexample.com",
      "https://attacker.com/https://example.com",
      "https://example.com.evil.tld",
      "http://example.com.",
    ]) {
      expect(await matchesOrigin(allowed, evil)).toBe(false);
    }

    expect(await matchesOrigin(allowed, "https://example.com")).toBe(true);
  });

  it("compares canonically: case and default port are insignificant", async () => {
    expect(
      await matchesOrigin(
        ["https://App.Example.com"],
        "https://app.example.com",
      ),
    ).toBe(true);
    expect(
      await matchesOrigin(
        ["https://app.example.com:443"],
        "https://app.example.com",
      ),
    ).toBe(true);
    expect(canonicalizeOrigin("HTTPS://App.Example.COM/")).toBe(
      "https://app.example.com",
    );
  });

  it("distinguishes scheme and port", async () => {
    expect(
      await matchesOrigin(["https://example.com"], "http://example.com"),
    ).toBe(false);
    expect(
      await matchesOrigin(["https://example.com"], "https://example.com:8443"),
    ).toBe(false);
  });

  it("ADVERSARIAL: Origin: null is not covered by the wildcard", async () => {
    expect(await matchesOrigin("*", "null")).toBe(false);
    expect(await matchesOrigin(["*"], "null")).toBe(false);
    // ...only when the operator asks for it explicitly.
    expect(await matchesOrigin(["null"], "null")).toBe(true);
  });

  it("recognises a wildcard element inside an array", () => {
    expect(hasWildcardOrigin("*")).toBe(true);
    expect(hasWildcardOrigin(["https://a.example", "*"])).toBe(true);
    expect(hasWildcardOrigin(["https://a.example"])).toBe(false);
  });
});

describe("createCorsPolicy", () => {
  it("ADVERSARIAL: rejects wildcard-plus-credentials in array form", () => {
    expect(() =>
      createCorsPolicy({ origin: ["*"], credentials: true }),
    ).toThrow(TypeError);
    expect(() =>
      createCorsPolicy({
        origin: ["https://a.example", "*"],
        credentials: true,
      }),
    ).toThrow(TypeError);
    expect(() => createCorsPolicy({ origin: "*", credentials: true })).toThrow(
      TypeError,
    );
  });

  it("allows a wildcard without credentials", () => {
    const policy = createCorsPolicy({ origin: ["*"] });

    expect(policy.wildcard).toBe(true);
    expect(policy.credentials).toBe(false);
  });

  it("preserves preflightContinue and optionsSuccessStatus", () => {
    const policy = createCorsPolicy({
      preflightContinue: true,
      optionsSuccessStatus: 200,
    });

    expect(policy.preflightContinue).toBe(true);
    expect(policy.optionsSuccessStatus).toBe(200);
  });
});

describe("createCorsHeaders", () => {
  it("ADVERSARIAL: never reflects an unlisted origin", async () => {
    const policy = createCorsPolicy({
      origin: ["https://example.com"],
      credentials: true,
    });

    const headers = await createCorsHeaders(
      { origin: "https://evil.attacker.com", method: "GET" },
      policy,
    );

    expect(headers["Access-Control-Allow-Origin"]).toBeUndefined();
    expect(headers["Access-Control-Allow-Credentials"]).toBeUndefined();
  });

  it("emits * for a credential-less wildcard, never the reflected origin", async () => {
    const policy = createCorsPolicy({ origin: ["*"] });

    const headers = await createCorsHeaders(
      { origin: "https://evil.attacker.com", method: "GET" },
      policy,
    );

    expect(headers["Access-Control-Allow-Origin"]).toBe("*");
    expect(headers["Access-Control-Allow-Credentials"]).toBeUndefined();
  });

  it("reflects an explicitly allowed origin with credentials", async () => {
    const policy = createCorsPolicy({
      origin: ["https://example.com"],
      credentials: true,
    });

    const headers = await createCorsHeaders(
      { origin: "https://example.com", method: "GET" },
      policy,
    );

    expect(headers["Access-Control-Allow-Origin"]).toBe("https://example.com");
    expect(headers["Access-Control-Allow-Credentials"]).toBe("true");
  });
});

describe("Vary", () => {
  it("varies on Origin whenever the response depends on it", () => {
    const reflecting = createCorsPolicy({ origin: ["https://example.com"] });

    expect(
      getCorsVaryHeaders({ origin: "https://example.com" }, reflecting),
    ).toContain("Origin");

    const credentialed = createCorsPolicy({
      origin: ["https://example.com"],
      credentials: true,
    });

    expect(
      getCorsVaryHeaders({ origin: "https://example.com" }, credentialed),
    ).toContain("Origin");
  });

  it("ADVERSARIAL: a rejected origin still varies, so a CDN cannot poison it", async () => {
    const result = await evaluateCors(
      { origin: "https://evil.attacker.com", method: "GET" },
      { origin: ["https://example.com"] },
    );

    expect(result.allowed).toBe(false);
    expect(result.vary).toContain("Origin");
  });
});

describe("evaluateCorsDecision", () => {
  it("emits nothing for a request with no Origin header", async () => {
    const decision = await evaluateCorsDecision(
      { method: "GET" },
      { origin: ["https://example.com"] },
    );

    expect(decision.isCorsRequest).toBe(false);
    expect(decision.headers).toEqual({});
    expect(decision.terminate).toBe(false);
  });

  it("answers a valid preflight itself with 204 and the allow headers", async () => {
    const decision = await evaluateCorsDecision(
      {
        origin: "https://example.com",
        method: "OPTIONS",
        requestMethod: "PUT",
        requestHeaders: "content-type",
      },
      {
        origin: ["https://example.com"],
        allowedHeaders: ["content-type"],
        maxAge: 600,
      },
    );

    expect(decision.preflight).toBe(true);
    expect(decision.allowed).toBe(true);
    expect(decision.terminate).toBe(true);
    expect(decision.status).toBe(204);
    expect(decision.headers["Access-Control-Allow-Methods"]).toContain("PUT");
    expect(decision.headers["Access-Control-Max-Age"]).toBe("600");
    expect(decision.headers.Vary).toContain("Origin");
  });

  it("ADVERSARIAL: a preflight from a disallowed origin is terminated with no grant", async () => {
    const decision = await evaluateCorsDecision(
      {
        origin: "https://evil-example.com.attacker.com",
        method: "OPTIONS",
        requestMethod: "PUT",
      },
      { origin: ["https://example.com"], credentials: true },
    );

    expect(decision.allowed).toBe(false);
    expect(decision.terminate).toBe(true);
    expect(decision.headers["Access-Control-Allow-Origin"]).toBeUndefined();
    expect(decision.headers.Vary).toContain("Origin");
  });

  it("does not terminate the preflight when preflightContinue is set", async () => {
    const decision = await evaluateCorsDecision(
      {
        origin: "https://example.com",
        method: "OPTIONS",
        requestMethod: "GET",
      },
      { origin: ["https://example.com"], preflightContinue: true },
    );

    expect(decision.terminate).toBe(false);
  });

  it("rejects a preflight whose requested method is not allowed", async () => {
    const decision = await evaluateCorsDecision(
      {
        origin: "https://example.com",
        method: "OPTIONS",
        requestMethod: "TRACE",
      },
      { origin: ["https://example.com"], methods: ["GET", "POST"] },
    );

    expect(decision.allowed).toBe(false);
    expect(decision.headers["Access-Control-Allow-Origin"]).toBeUndefined();
  });
});
