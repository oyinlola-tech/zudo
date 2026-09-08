import { describe, expect, it } from "vitest";

import {
  compileTrustProxy,
  getClientIp,
  getProxyChain,
  getProxyInfo,
  getRequestHostname,
  getRequestPort,
  getRequestProtocol,
  isLinkLocalAddress,
  isLoopbackAddress,
  isSecureRequest,
  isTrustedPeer,
  isTrustedProxy,
  parseCidr,
  parseIpAddress,
  splitAddressAndPort,
} from "../src/httpTrustProxy/index.js";

import type { ProxyRequest } from "../src/httpTrustProxy/index.js";

function request(
  headers: Record<string, string | string[] | undefined>,
  remoteAddress?: string,
): ProxyRequest {
  return {
    headers,
    socket: remoteAddress === undefined ? undefined : { remoteAddress },
  };
}

describe("IP parsing", () => {
  it("parses IPv4 and rejects out-of-range octets", () => {
    expect(parseIpAddress("10.0.0.1")?.family).toBe(4);
    expect(parseIpAddress("256.0.0.1")).toBeUndefined();
    expect(parseIpAddress("10.0.0")).toBeUndefined();
  });

  it("collapses IPv4-mapped IPv6 to IPv4", () => {
    const mapped = parseIpAddress("::ffff:127.0.0.1");

    expect(mapped?.family).toBe(4);
    expect(isLoopbackAddress("::ffff:127.0.0.1")).toBe(true);
  });

  it("strips brackets and IPv6 zone identifiers", () => {
    expect(parseIpAddress("[fe80::1%eth0]")?.family).toBe(6);
    expect(isLinkLocalAddress("fe80::1%eth0")).toBe(true);
  });

  it("does not treat ::10 or ::1a as loopback", () => {
    // The previous implementation used startsWith("::1").
    expect(isLoopbackAddress("::10")).toBe(false);
    expect(isLoopbackAddress("::1a")).toBe(false);
    expect(isLoopbackAddress("::1")).toBe(true);
  });

  it("matches link-local against the real ranges, not loopback", () => {
    expect(isLinkLocalAddress("169.254.169.254")).toBe(true);
    expect(isLinkLocalAddress("fe80::1")).toBe(true);
    expect(isLinkLocalAddress("127.0.0.1")).toBe(false);
  });

  it("parses CIDR and rejects an over-wide prefix", () => {
    expect(parseCidr("10.0.0.0/8")?.prefix).toBe(8);
    expect(parseCidr("10.0.0.0/33")).toBeUndefined();
    expect(parseCidr("10.0.0.0")).toBeUndefined();
  });

  it("splits IPv6 literals without mangling them", () => {
    expect(splitAddressAndPort("[::1]:8080")).toEqual({
      address: "::1",
      port: 8080,
    });
    expect(splitAddressAndPort("::1")).toEqual({
      address: "::1",
      port: undefined,
    });
    expect(splitAddressAndPort("1.2.3.4:80")).toEqual({
      address: "1.2.3.4",
      port: 80,
    });
  });
});

describe("compileTrustProxy", () => {
  it("matches CIDR ranges instead of exact strings", () => {
    const predicate = compileTrustProxy("10.0.0.0/8");

    expect(predicate("10.4.5.6", 0)).toBe(true);
    expect(predicate("11.4.5.6", 0)).toBe(false);
  });

  it("supports named presets with the correct ranges", () => {
    expect(compileTrustProxy("linklocal")("169.254.169.254", 0)).toBe(true);
    expect(compileTrustProxy("linklocal")("127.0.0.1", 0)).toBe(false);
    expect(compileTrustProxy("loopback")("127.0.0.1", 0)).toBe(true);
    expect(compileTrustProxy("uniquelocal")("192.168.1.5", 0)).toBe(true);
  });

  it("throws on a configuration value that could never match", () => {
    expect(() => compileTrustProxy("not-an-address")).toThrow(TypeError);
    expect(() => compileTrustProxy(["10.0.0.1", "garbage"])).toThrow(TypeError);
  });

  it("trusts nothing by default", () => {
    expect(compileTrustProxy(false)("10.0.0.1", 0)).toBe(false);
  });
});

describe("getClientIp — spoofed X-Forwarded-For", () => {
  it("ADVERSARIAL: ignores a spoofed chain from an untrusted peer", () => {
    const spoofed = request(
      { "x-forwarded-for": "8.8.8.8, 10.0.0.1" },
      "203.0.113.9",
    );

    expect(getClientIp(spoofed, ["10.0.0.1"])).toBe("203.0.113.9");
    expect(getClientIp(spoofed, "10.0.0.0/8")).toBe("203.0.113.9");
    expect(getClientIp(spoofed, false)).toBe("203.0.113.9");
  });

  it("ADVERSARIAL: a direct client cannot claim to be loopback", () => {
    const spoofed = request({ "x-forwarded-for": "127.0.0.1" }, "203.0.113.9");

    expect(getClientIp(spoofed, "loopback")).toBe("203.0.113.9");
    expect(getClientIp(spoofed, ["10.0.0.1"])).toBe("203.0.113.9");
  });

  it("ADVERSARIAL: an attacker cannot pad the chain to hide behind trusted hops", () => {
    // Attacker connects directly and forges a chain that ends in the real LB.
    const spoofed = request(
      { "x-forwarded-for": "1.2.3.4, 10.0.0.1, 10.0.0.2" },
      "198.51.100.7",
    );

    expect(getClientIp(spoofed, "10.0.0.0/8")).toBe("198.51.100.7");
  });

  it("returns the first untrusted hop for a genuine proxied request", () => {
    const proxied = request(
      { "x-forwarded-for": "1.2.3.4, 10.0.0.2" },
      "10.0.0.1",
    );

    expect(getClientIp(proxied, "10.0.0.0/8")).toBe("1.2.3.4");
  });

  it("stops at the first untrusted hop, not the left-most entry", () => {
    const proxied = request(
      { "x-forwarded-for": "1.2.3.4, 203.0.113.5, 10.0.0.2" },
      "10.0.0.1",
    );

    expect(getClientIp(proxied, "10.0.0.0/8")).toBe("203.0.113.5");
  });

  it("trustProxy true means trust every hop and take the left-most entry", () => {
    const proxied = request(
      { "x-forwarded-for": "1.2.3.4, 10.0.0.2" },
      "10.0.0.1",
    );

    expect(getClientIp(proxied, true)).toBe("1.2.3.4");
  });

  it("passes a hop index counted from the peer to a custom predicate", () => {
    const seen: [string, number][] = [];

    const proxied = request(
      { "x-forwarded-for": "1.2.3.4, 10.0.0.2" },
      "10.0.0.1",
    );

    getClientIp(proxied, (address, index) => {
      seen.push([address, index]);

      return index < 1;
    });

    expect(seen[0]).toEqual(["10.0.0.1", 0]);
    expect(seen[1]).toEqual(["10.0.0.2", 1]);
  });

  it("honours repeated X-Forwarded-For headers as one chain", () => {
    const proxied = request(
      { "x-forwarded-for": ["1.2.3.4", "10.0.0.2"] },
      "10.0.0.1",
    );

    expect(getClientIp(proxied, "10.0.0.0/8")).toBe("1.2.3.4");
  });

  it("includes the socket peer in the reported chain", () => {
    const proxied = request({ "x-forwarded-for": "1.2.3.4" }, "10.0.0.1");

    expect(getProxyChain(proxied)).toEqual(["1.2.3.4", "10.0.0.1"]);
  });
});

describe("forwarded protocol / host / port", () => {
  it("ADVERSARIAL: an untrusted peer cannot claim https", () => {
    const spoofed = request({ "x-forwarded-proto": "https" }, "203.0.113.9");

    expect(getRequestProtocol(spoofed, ["10.0.0.1"])).toBe("http");
    expect(isSecureRequest(spoofed, ["10.0.0.1"])).toBe(false);
    expect(isSecureRequest(spoofed, false)).toBe(false);
    // `true` is an explicit operator opt-in to trusting every peer, so it is
    // expected to honour the header; the defect was honouring it for a
    // *configured but non-matching* trust set.
    expect(isSecureRequest(spoofed, true)).toBe(true);
  });

  it("ADVERSARIAL: an unrecognised protocol is discarded, not echoed", () => {
    const odd = request({ "x-forwarded-proto": "gopher" }, "10.0.0.1");

    expect(getRequestProtocol(odd, "10.0.0.0/8")).toBe("http");
  });

  it("honours the protocol from a trusted peer", () => {
    const proxied = request({ "x-forwarded-proto": "https" }, "10.0.0.1");

    expect(getRequestProtocol(proxied, "10.0.0.0/8")).toBe("https");
    expect(isSecureRequest(proxied, "10.0.0.0/8")).toBe(true);
  });

  it("reads the RFC 7239 proto parameter", () => {
    const proxied = request(
      { forwarded: "for=1.2.3.4;proto=https;host=app.example.com" },
      "10.0.0.1",
    );

    expect(getRequestProtocol(proxied, "10.0.0.0/8")).toBe("https");
    expect(getRequestHostname(proxied, "10.0.0.0/8")).toBe("app.example.com");
  });

  it("does not mangle an IPv6 forwarded host", () => {
    const proxied = request({ "x-forwarded-host": "[::1]:8080" }, "10.0.0.1");

    expect(getRequestHostname(proxied, "10.0.0.0/8")).toBe("::1");
    expect(getRequestPort(proxied, "10.0.0.0/8")).toBe(8080);
  });

  it("ADVERSARIAL: an untrusted peer cannot set the hostname or port", () => {
    const spoofed = request(
      { "x-forwarded-host": "admin.internal", "x-forwarded-port": "443" },
      "203.0.113.9",
    );

    expect(getRequestHostname(spoofed, ["10.0.0.1"])).toBeUndefined();
    expect(getRequestPort(spoofed, ["10.0.0.1"])).toBeUndefined();
  });
});

describe("isTrustedPeer / isTrustedProxy / getProxyInfo", () => {
  it("checks the socket peer, not merely whether a config exists", () => {
    expect(isTrustedPeer(request({}, "203.0.113.9"), ["10.0.0.1"])).toBe(false);
    expect(isTrustedPeer(request({}, "10.0.0.1"), ["10.0.0.1"])).toBe(true);
    expect(isTrustedPeer(request({}, undefined), true)).toBe(false);
  });

  it("normalises IPv4-mapped peers before comparing", () => {
    expect(isTrustedProxy("::ffff:10.0.0.1", "10.0.0.0/8")).toBe(true);
  });

  it("populates the client port from a forwarded entry", () => {
    const proxied = request({ forwarded: 'for="1.2.3.4:1234"' }, "10.0.0.1");

    const info = getProxyInfo(proxied, "10.0.0.0/8");

    expect(info.clientIp).toBe("1.2.3.4");
    expect(info.clientPort).toBe(1234);
  });
});
