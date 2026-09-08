import { describe, expect, it } from "vitest";

import {
  assertSafeProxyRedirect,
  assertSafeProxyTarget,
  createProxyRequest,
  getProxyTargetRejection,
  isBlockedProxyAddress,
  isSafeProxyTarget,
  prepareProxyHeaders,
  removeHopByHopHeaders,
  resolveProxyTarget,
  setForwardedHeaders,
} from "../src/httpProxy/index.js";

import type { HTTPHeader } from "../src/httpProtocol/http.protocol.js";

const SSRF_TARGETS = [
  "http://169.254.169.254/",
  "http://169.254.169.254/latest/meta-data/iam/security-credentials/",
  "http://metadata.google.internal/computeMetadata/v1/",
  "http://[fd00:ec2::254]/latest/meta-data/",
  "http://127.0.0.1:8080/admin",
  "http://localhost:5432/",
  "http://[::1]/admin",
  "http://10.0.0.5/internal",
  "http://192.168.1.1/",
  "http://172.16.5.4/",
  "http://0.0.0.0/",
  "http://redis.internal/",
  "http://db.local/",
  "http://api.localhost/",
];

function headers(entries: [string, string][]): HTTPHeader[] {
  return entries.map(([name, value]) => ({ name, value }));
}

describe("SSRF guard", () => {
  it("ADVERSARIAL: refuses cloud metadata and internal-network targets", () => {
    for (const target of SSRF_TARGETS) {
      expect(isSafeProxyTarget(target)).toBe(false);
      expect(getProxyTargetRejection(target)).toBeTypeOf("string");
      expect(() => assertSafeProxyTarget(target)).toThrow(TypeError);
      expect(() => resolveProxyTarget(target)).toThrow(TypeError);
    }
  });

  it("ADVERSARIAL: refuses non-http schemes", () => {
    for (const target of [
      "file:///etc/passwd",
      "gopher://127.0.0.1:6379/_INFO",
      "ftp://example.com/",
    ]) {
      expect(isSafeProxyTarget(target)).toBe(false);
    }
  });

  it("allows an ordinary public target", () => {
    expect(isSafeProxyTarget("https://api.example.com/v1")).toBe(true);
    expect(resolveProxyTarget("https://api.example.com/v1").hostname).toBe(
      "api.example.com",
    );
  });

  it("honours allowPrivateTargets as an explicit opt-out", () => {
    expect(
      isSafeProxyTarget("http://127.0.0.1:8080/", {
        allowPrivateTargets: true,
      }),
    ).toBe(true);
    expect(
      isSafeProxyTarget("http://10.0.0.5/", { allowPrivateTargets: true }),
    ).toBe(true);
  });

  it("ADVERSARIAL: allowPrivateTargets never unblocks cloud metadata", () => {
    // The metadata endpoints are named in the host blocklist, which the
    // private-range opt-out does not reach — there is no legitimate reason to
    // proxy to them.
    for (const target of [
      "http://169.254.169.254/",
      "http://metadata.google.internal/",
      "http://localhost/",
    ]) {
      expect(isSafeProxyTarget(target, { allowPrivateTargets: true })).toBe(
        false,
      );
    }
  });

  it("allowedHosts is an exact allowlist", () => {
    const options = { allowedHosts: ["api.example.com"] };

    expect(isSafeProxyTarget("https://api.example.com/x", options)).toBe(true);
    expect(
      isSafeProxyTarget("https://api.example.com.attacker.com/x", options),
    ).toBe(false);
    expect(isSafeProxyTarget("https://evil.com/x", options)).toBe(false);
  });

  it("exposes a post-DNS-resolution check for the transport layer", () => {
    expect(isBlockedProxyAddress("169.254.169.254")).toBe(true);
    expect(isBlockedProxyAddress("127.0.0.1")).toBe(true);
    expect(isBlockedProxyAddress("::ffff:10.0.0.1")).toBe(true);
    expect(isBlockedProxyAddress("93.184.216.34")).toBe(false);
  });

  it("ADVERSARIAL: a redirect cannot re-cross the trust boundary", () => {
    expect(() =>
      assertSafeProxyRedirect(
        "http://169.254.169.254/latest/meta-data/",
        "https://api.example.com/v1",
      ),
    ).toThrow(TypeError);

    expect(() =>
      assertSafeProxyRedirect("/other", "https://api.example.com/v1"),
    ).not.toThrow();

    expect(
      assertSafeProxyRedirect("/other", "https://api.example.com/v1").href,
    ).toBe("https://api.example.com/other");
  });
});

describe("hop-by-hop headers", () => {
  const hostile = headers([
    ["host", "app.example.com"],
    ["connection", "keep-alive, x-secret"],
    ["keep-alive", "timeout=5"],
    ["transfer-encoding", "chunked"],
    ["content-length", "5"],
    ["te", "trailers"],
    ["trailer", "Expires"],
    ["upgrade", "websocket"],
    ["proxy-authorization", "Basic c2VjcmV0"],
    ["proxy-authenticate", "Basic"],
    ["x-secret", "leaked"],
    ["accept", "application/json"],
  ]);

  it("ADVERSARIAL: prepareProxyHeaders strips them (previously never called)", () => {
    const target = resolveProxyTarget("https://api.example.com");

    const result = prepareProxyHeaders(hostile, target, {});

    const names = result.map((header) => header.name.toLowerCase());

    for (const dropped of [
      "connection",
      "keep-alive",
      "transfer-encoding",
      "te",
      "trailer",
      "upgrade",
      "proxy-authorization",
      "proxy-authenticate",
      "x-secret",
    ]) {
      expect(names).not.toContain(dropped);
    }

    expect(names).toContain("accept");
    expect(names).toContain("content-length");
  });

  it("ADVERSARIAL: createProxyRequest strips them end to end", () => {
    const request = createProxyRequest("POST", "/v1/items", hostile, {
      target: "https://api.example.com",
    });

    const names = request.headers.map((header) => header.name.toLowerCase());

    expect(names).not.toContain("transfer-encoding");
    expect(names).not.toContain("proxy-authorization");
  });

  it("removeHopByHopHeaders honours Connection tokens", () => {
    const result = removeHopByHopHeaders(hostile);

    expect(result.map((header) => header.name)).not.toContain("x-secret");
  });
});

describe("X-Forwarded-* headers", () => {
  const target = resolveProxyTarget("http://upstream.internal.example.com");

  it("ADVERSARIAL: a client-supplied X-Forwarded-Proto cannot survive", () => {
    const result = setForwardedHeaders(
      headers([["x-forwarded-proto", "https"]]),
      target,
      { protocol: "http", host: "app.example.com", clientIp: "1.2.3.4" },
    );

    const proto = result.find(
      (header) => header.name.toLowerCase() === "x-forwarded-proto",
    );

    // Previously this appended, producing "https, http", and every consumer
    // reads [0] — so the upstream believed the request arrived over TLS.
    expect(proto?.value).toBe("http");
  });

  it("writes the client's scheme and host, not the upstream target's", () => {
    const result = setForwardedHeaders(headers([]), target, {
      protocol: "https",
      host: "app.example.com",
      clientIp: "1.2.3.4",
      port: 443,
    });

    const byName = (name: string) =>
      result.find((header) => header.name.toLowerCase() === name)?.value;

    expect(byName("x-forwarded-proto")).toBe("https");
    expect(byName("x-forwarded-host")).toBe("app.example.com");
    expect(byName("x-forwarded-port")).toBe("443");
    expect(byName("x-forwarded-for")).toBe("1.2.3.4");
  });

  it("appends the client IP to an existing chain", () => {
    const result = setForwardedHeaders(
      headers([["x-forwarded-for", "10.0.0.9"]]),
      target,
      { protocol: "http", host: "app.example.com", clientIp: "1.2.3.4" },
    );

    expect(
      result.find((header) => header.name.toLowerCase() === "x-forwarded-for")
        ?.value,
    ).toBe("10.0.0.9, 1.2.3.4");
  });

  it("ADVERSARIAL: drops an unverified chain when no client IP was resolved", () => {
    const result = setForwardedHeaders(
      headers([
        ["x-forwarded-for", "8.8.8.8"],
        ["x-forwarded-host", "admin.internal"],
      ]),
      target,
      {},
    );

    const names = result.map((header) => header.name.toLowerCase());

    expect(names).not.toContain("x-forwarded-for");
    expect(names).not.toContain("x-forwarded-host");
  });

  it("is only applied when xfwd is set", () => {
    const result = prepareProxyHeaders(
      headers([["accept", "*/*"]]),
      target,
      { xfwd: true },
      { protocol: "https", host: "app.example.com", clientIp: "1.2.3.4" },
    );

    expect(
      result.find((header) => header.name.toLowerCase() === "x-forwarded-proto")
        ?.value,
    ).toBe("https");
  });
});
