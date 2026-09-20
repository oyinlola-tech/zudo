/**
 * Audit round 11 — regressions for the `@zudojs/http` client/edge surface.
 *
 * One `describe` block per finding id (HTTPB-01..08, HTTPA-04, HTTPA-08).
 */

import { describe, it, expect, beforeEach } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";

import {
  createHTTPAdapter,
  NodeHTTPAdapter,
  adaptNodeRequest,
  adaptNodeContext,
} from "../src/httpAdapter/http.adapters.js";

import {
  createHTTPRequest,
  getRequestIP,
  getRequestProtocol,
} from "../src/httpRequest/http.request.js";

import {
  clearAgents,
  getAgent,
  getOrCreateAgent,
  getRegisteredAgentKeys,
  hasAgent,
  removeAgent,
} from "../src/httpAgent/http.agent.js";

import {
  createForwardedHeader,
  parseForwardedHeader,
  isSafeProxyTarget,
} from "../src/httpProxy/http.proxy.js";

import {
  formatKeepAliveHeader,
  parseKeepAliveHeader,
} from "../src/httpKeepAlive/httpKeepAlive.core.js";

import { createSecurityMiddleware } from "../src/httpMiddleware/builtin/security/httpMiddleware.security.js";
import { createLoggingMiddleware } from "../src/httpMiddleware/builtin/logging/httpMiddleware.logging.js";
import { createDefaultSecurityHeaders } from "../src/httpSecurityHeaders/httpSecurityHeader.recommended.js";

import { guardRequest } from "../src/httpSecurity/httpSecurity.guard.js";

import {
  assertNoRedirectLoop,
  hasRedirectLoop,
  isHTTPS,
  isSameOrigin,
} from "../src/httpRedirect/http.redirect.js";

import {
  createRequestContext,
  getCurrentRequestContext,
  runWithRequestContext,
  getPathname,
} from "../src/httpRequest/httpRequest.context.js";

import { createResponseContext } from "../src/httpResponse/httpResponse.context.js";

import type { HttpResponseContext } from "../src/httpResponse/httpResponse.context.js";
import { HttpResponseContext as HttpResponseContextClass } from "../src/httpResponse/httpResponse.context.js";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** An untrusted, publicly routable direct client. */
const UNTRUSTED_PEER = "203.0.113.9";

function nodeRequest(
  options: {
    readonly headers?: Record<string, string | string[] | undefined>;
    readonly remoteAddress?: string;
    readonly url?: string;
    readonly encrypted?: boolean;
  } = {},
): IncomingMessage {
  return {
    method: "GET",
    url: options.url ?? "/resource",
    headers: { host: "example.com", ...options.headers },
    socket: {
      remoteAddress: options.remoteAddress ?? UNTRUSTED_PEER,
      ...(options.encrypted === undefined
        ? {}
        : { encrypted: options.encrypted }),
    },
  } as unknown as IncomingMessage;
}

function spoofedRequest(): IncomingMessage {
  return nodeRequest({
    headers: {
      "x-forwarded-for": "10.0.0.1",
      "x-forwarded-proto": "https",
    },
  });
}

function asResponseContext(result: unknown): HttpResponseContext {
  expect(result).toBeInstanceOf(HttpResponseContextClass);

  return result as HttpResponseContext;
}

/* -------------------------------------------------------------------------- */
/* HTTPB-01                                                                   */
/* -------------------------------------------------------------------------- */

describe("HTTPB-01 — forwarded headers are ignored unless the peer is trusted", () => {
  it("createHTTPAdapter().createRequest ignores X-Forwarded-* by default", () => {
    const request = createHTTPAdapter().createRequest(spoofedRequest());

    expect(request.ip).toBe(UNTRUSTED_PEER);
    expect(request.protocol).toBe("http");
    expect(request.secure).toBe(false);
  });

  it("adaptNodeRequest ignores X-Forwarded-* by default", () => {
    const request = adaptNodeRequest(spoofedRequest());

    expect(request.ip).toBe(UNTRUSTED_PEER);
    expect(request.protocol).toBe("http");
    expect(request.secure).toBe(false);
  });

  it("adaptNodeContext ignores X-Forwarded-* by default", () => {
    const context = adaptNodeContext(
      spoofedRequest(),
      {} as unknown as ServerResponse,
    );

    expect(context.request.ip).toBe(UNTRUSTED_PEER);
    expect(context.request.secure).toBe(false);
  });

  it("never lets a non-http(s) forwarded proto flip `secure`", () => {
    const request = createHTTPRequest(
      nodeRequest({ headers: { "x-forwarded-proto": "wss" } }),
      { trustProxy: UNTRUSTED_PEER },
    );

    expect(request.protocol).toBe("http");
    expect(request.secure).toBe(false);
  });

  it("honours the headers once the peer is a configured trusted proxy", () => {
    const request = createHTTPRequest(spoofedRequest(), {
      trustProxy: UNTRUSTED_PEER,
    });

    expect(request.ip).toBe("10.0.0.1");
    expect(request.protocol).toBe("https");
    expect(request.secure).toBe(true);
  });

  it("threads trustProxy through the adapter and the standalone helpers", () => {
    const adapter = new NodeHTTPAdapter({ trustProxy: UNTRUSTED_PEER });

    expect(adapter.createRequest(spoofedRequest()).ip).toBe("10.0.0.1");

    expect(
      createHTTPAdapter({ trustProxy: UNTRUSTED_PEER }).createRequest(
        spoofedRequest(),
      ).secure,
    ).toBe(true);

    expect(
      adaptNodeRequest(spoofedRequest(), { trustProxy: UNTRUSTED_PEER }).ip,
    ).toBe("10.0.0.1");

    expect(
      adaptNodeContext(spoofedRequest(), {} as unknown as ServerResponse, {
        trustProxy: UNTRUSTED_PEER,
      }).request.ip,
    ).toBe("10.0.0.1");
  });

  it("keeps the socket's own TLS state authoritative", () => {
    expect(getRequestProtocol(nodeRequest({ encrypted: true }))).toBe("https");
    expect(getRequestIP(nodeRequest())).toBe(UNTRUSTED_PEER);
  });
});

/* -------------------------------------------------------------------------- */
/* HTTPB-02                                                                   */
/* -------------------------------------------------------------------------- */

describe("HTTPB-02 — the agent registry can find what it created", () => {
  beforeEach(() => {
    clearAgents();
  });

  it("finds and removes an agent created with no options", () => {
    const agent = getOrCreateAgent("https://api.example.com");

    expect(getAgent("https://api.example.com")).toBe(agent);
    expect(hasAgent("https://api.example.com")).toBe(true);

    expect(removeAgent("https://api.example.com")).toBe(true);
    expect(getRegisteredAgentKeys()).toEqual([]);
    expect(hasAgent("https://api.example.com")).toBe(false);
  });

  it("finds an agent keyed by its TLS options", () => {
    const pinned = getOrCreateAgent("https://api.example.com", {
      servername: "api.example.com",
    });

    expect(getAgent("https://api.example.com")).not.toBe(pinned);

    expect(
      getAgent("https://api.example.com", { servername: "api.example.com" }),
    ).toBe(pinned);
  });

  it("removes every agent for a host when no options are given", () => {
    getOrCreateAgent("https://api.example.com");
    getOrCreateAgent("https://api.example.com", { servername: "a" });
    getOrCreateAgent("https://other.example.com");

    expect(removeAgent("https://api.example.com")).toBe(true);

    expect(
      getRegisteredAgentKeys().filter((key) =>
        key.startsWith("https://api.example.com"),
      ),
    ).toEqual([]);

    expect(hasAgent("https://other.example.com")).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* HTTPB-03                                                                   */
/* -------------------------------------------------------------------------- */

describe("HTTPB-03 — quoted header parameters cannot carry CR/LF", () => {
  it("refuses to re-emit a Forwarded value containing CRLF", () => {
    const [parsed] = parseForwardedHeader(
      'for="1.2.3.4\r\nX-Evil: 1";proto=http',
    );

    expect(parsed).toBeDefined();

    expect(() => createForwardedHeader(parsed!)).toThrow(TypeError);
  });

  it("still emits an ordinary Forwarded value", () => {
    expect(createForwardedHeader({ for: "1.2.3.4", protocol: "https" })).toBe(
      "for=1.2.3.4; proto=https",
    );
  });

  it("refuses to emit a Keep-Alive extension containing CRLF", () => {
    expect(() =>
      formatKeepAliveHeader(
        parseKeepAliveHeader('timeout=5, ext="a\r\nX-Evil: 1"'),
      ),
    ).toThrow(TypeError);
  });

  it("still emits ordinary Keep-Alive parameters", () => {
    expect(
      formatKeepAliveHeader({ timeout: 5, max: 100, extensions: {} }),
    ).toBe("timeout=5, max=100");
  });
});

/* -------------------------------------------------------------------------- */
/* HTTPB-04                                                                   */
/* -------------------------------------------------------------------------- */

describe("HTTPB-04 — the zero-config security middleware emits the package baseline", () => {
  it("emits the same header set as createDefaultSecurityHeaders()", async () => {
    const response = asResponseContext(
      await createSecurityMiddleware()(
        {
          request: createRequestContext({
            method: "GET",
            url: "/",
            headers: {},
          }),
          response: createResponseContext(),
        } as never,
        async () => createResponseContext(),
      ),
    );

    const baseline = createDefaultSecurityHeaders() as Record<string, string>;

    for (const [name, value] of Object.entries(baseline)) {
      expect(response.headers[name]).toBe(value);
    }

    expect(response.headers["content-security-policy"]).toBeDefined();
    expect(response.headers["strict-transport-security"]).toBeDefined();
    expect(response.headers["permissions-policy"]).toBeDefined();
  });

  it("still lets an explicit option override the baseline", async () => {
    const response = asResponseContext(
      await createSecurityMiddleware({ xFrameOptions: "SAMEORIGIN" })(
        {
          request: createRequestContext({
            method: "GET",
            url: "/",
            headers: {},
          }),
          response: createResponseContext(),
        } as never,
        async () => createResponseContext(),
      ),
    );

    expect(response.headers["x-frame-options"]).toBe("SAMEORIGIN");
  });

  it("emits nothing but the explicit options when useDefaults is false", async () => {
    const response = asResponseContext(
      await createSecurityMiddleware({
        useDefaults: false,
        xFrameOptions: "DENY",
      })(
        {
          request: createRequestContext({
            method: "GET",
            url: "/",
            headers: {},
          }),
          response: createResponseContext(),
        } as never,
        async () => createResponseContext(),
      ),
    );

    expect(response.headers["x-frame-options"]).toBe("DENY");
    expect(response.headers["content-security-policy"]).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/* HTTPB-05                                                                   */
/* -------------------------------------------------------------------------- */

describe("HTTPB-05 — guardRequest checks array-valued headers", () => {
  it("applies the size and CRLF limits to every element of an array value", () => {
    const result = guardRequest({
      method: "GET",
      url: "/",
      headers: {
        host: "example.com",
        "x-big": ["a".repeat(100_000)],
        "x-crlf": ["v\r\nInjected: 1"],
      },
    });

    expect(result.allowed).toBe(false);
    expect(result.statusCode).toBe(400);
    expect(result.errors.some((error) => error.includes("x-big"))).toBe(true);
    expect(result.errors.some((error) => error.includes("x-crlf"))).toBe(true);
  });

  it("leaves an ordinary array-valued header alone", () => {
    const result = guardRequest({
      method: "GET",
      url: "/",
      headers: {
        host: "example.com",
        "set-cookie": ["a=1", "b=2"],
      },
    });

    expect(result.allowed).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* HTTPB-06                                                                   */
/* -------------------------------------------------------------------------- */

describe("HTTPB-06 — the redirect predicates accept a relative Location", () => {
  it("detects a loop across relative locations", () => {
    expect(hasRedirectLoop(["/a", "/a"])).toBe(true);
    expect(hasRedirectLoop(["/a", "/b"])).toBe(false);
  });

  it("passes a relative chain through assertNoRedirectLoop", () => {
    expect(() => assertNoRedirectLoop(["/a", "/b"])).not.toThrow();
    expect(() => assertNoRedirectLoop(["/a", "/a"])).toThrow();
  });

  it("answers isSameOrigin and isHTTPS instead of throwing", () => {
    expect(isSameOrigin("/a", "/b")).toBe(true);
    expect(isSameOrigin("/a", "https://example.com/a")).toBe(false);
    expect(isHTTPS("/a")).toBe(false);
    expect(isHTTPS("https://example.com/a")).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* HTTPB-07                                                                   */
/* -------------------------------------------------------------------------- */

describe("HTTPB-07 — the proxy blocklist covers the reserved IPv4 ranges", () => {
  it("rejects 192.0.0.0/24 and 198.18.0.0/15", () => {
    expect(isSafeProxyTarget("http://192.0.0.1/")).toBe(false);
    expect(isSafeProxyTarget("http://192.0.0.170/")).toBe(false);
    expect(isSafeProxyTarget("http://198.18.0.1/")).toBe(false);
    expect(isSafeProxyTarget("http://198.19.255.255/")).toBe(false);
  });

  it("still accepts an ordinary public address", () => {
    expect(isSafeProxyTarget("http://192.0.2.1/")).toBe(true);
    expect(isSafeProxyTarget("http://198.20.0.1/")).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* HTTPB-08                                                                   */
/* -------------------------------------------------------------------------- */

describe("HTTPB-08 — the logging middleware redacts credential headers", () => {
  it("never hands Authorization or Cookie to the logger", async () => {
    const records: Record<string, unknown>[] = [];

    const middleware = createLoggingMiddleware({
      logger: {
        info: (_message, metadata) => {
          records.push({ ...metadata });
        },
      },
      includeHeaders: true,
    });

    await middleware(
      {
        request: createRequestContext({
          method: "GET",
          url: "/",
          headers: {
            authorization: "Bearer secret-token",
            cookie: "session=abc",
            "proxy-authorization": "Basic zzz",
            "x-trace": "keep-me",
          },
        }),
        response: createResponseContext(),
      } as never,
      async () => createResponseContext(),
    );

    const headers = records[0]?.headers as Record<string, string>;

    expect(headers.authorization).not.toContain("secret-token");
    expect(headers.cookie).not.toContain("abc");
    expect(headers["proxy-authorization"]).not.toContain("zzz");
    expect(headers["x-trace"]).toBe("keep-me");
  });
});

/* -------------------------------------------------------------------------- */
/* HTTPA-04                                                                   */
/* -------------------------------------------------------------------------- */

describe("HTTPA-04 — the request-context store works under ESM", () => {
  it("propagates the context through runWithRequestContext", () => {
    const context = createRequestContext({
      method: "GET",
      url: "/",
      headers: {},
    });

    const seen = runWithRequestContext(context, () =>
      getCurrentRequestContext(),
    );

    expect(seen).toBe(context);
  });

  it("propagates across an await boundary", async () => {
    const context = createRequestContext({
      method: "GET",
      url: "/",
      headers: {},
    });

    const seen = await runWithRequestContext(context, async () => {
      await Promise.resolve();

      return getCurrentRequestContext();
    });

    expect(seen).toBe(context);
  });
});

/* -------------------------------------------------------------------------- */
/* HTTPA-08                                                                   */
/* -------------------------------------------------------------------------- */

describe("HTTPA-08 — request.path agrees with the router about repeated slashes", () => {
  it("collapses repeated slashes in the canonical path", () => {
    expect(getPathname("//admin/secret")).toBe("/admin/secret");
    expect(getPathname("/admin//secret")).toBe("/admin/secret");
    expect(getPathname("http://example.com//admin//secret")).toBe(
      "/admin/secret",
    );
  });

  it("leaves the context path in agreement with the dispatch path", async () => {
    const { normalizePath } = await import("../src/httpUrl/http.url.js");

    const context = createRequestContext({
      method: "GET",
      url: "//admin/secret",
      headers: {},
    });

    expect(context.path).toBe("/admin/secret");

    /* The path a guard reads and the path the router dispatches on. */
    expect(context.path).toBe(normalizePath("//admin/secret"));
  });

  it("does not touch the query string", () => {
    expect(getPathname("/a?next=//evil")).toBe("/a");
  });
});
