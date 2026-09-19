/**
 * Audit round 10 regressions for @zudojs/security: rate-limit keys.
 */

import { describe, it, expect } from "vitest";

import {
  createIpKeyGenerator,
  createRateLimiter,
  defaultKeyGenerator,
  extractClientIp,
  ipRateLimitKey,
} from "../src/index.js";

describe("security/SEC-01", () => {
  it("extractClientIp strips the port a proxy appended", () => {
    const headers = { "x-forwarded-for": "203.0.113.5:50001" };
    expect(extractClientIp(headers, { trustProxy: 1 })).toBe("203.0.113.5");
    expect(extractClientIp({ "x-forwarded-for": "[2001:db8::1]:443" }, { trustProxy: 1 })).toBe(
      "2001:db8::1",
    );
  });

  it("one client rotating source ports shares one bucket", () => {
    const limiter = createRateLimiter({ max: 2, windowMs: 60_000 });
    try {
      let allowed = 0;
      for (let port = 50_001; port <= 50_010; port++) {
        const ip = extractClientIp(
          { "x-forwarded-for": `203.0.113.5:${port}` },
          { trustProxy: 1 },
        );
        if (limiter.check({ ip }).allowed) allowed++;
      }
      expect(allowed).toBe(2);
    } finally {
      limiter.destroy();
    }
  });

  it("IPv6 addresses in one /64 share one bucket", () => {
    const limiter = createRateLimiter({ max: 2, windowMs: 60_000 });
    try {
      let allowed = 0;
      for (let i = 1; i <= 10; i++) {
        if (limiter.check({ ip: `2001:db8:1:2::${i.toString(16)}` }).allowed) allowed++;
      }
      expect(allowed).toBe(2);
      expect(limiter.check({ ip: "2001:db8:1:3::1" }).allowed).toBe(true);
      expect(limiter.getCount("2001:db8:1:2::ffff")).toBe(2);
    } finally {
      limiter.destroy();
    }
  });

  it("keys IPv4-mapped IPv6 as IPv4 and honours a custom prefix", () => {
    expect(ipRateLimitKey("::ffff:198.51.100.7")).toBe("198.51.100.7");
    expect(ipRateLimitKey("2001:db8:aaaa:bbbb:1:2:3:4", { ipv6PrefixLength: 48 })).toBe(
      "2001:db8:aaaa:0:0:0:0:0/48",
    );
    expect(createIpKeyGenerator({ ipv6PrefixLength: 128 })({ ip: "2001:db8::1" })).toBe(
      "2001:db8:0:0:0:0:0:1/128",
    );
    expect(() => createIpKeyGenerator({ ipv6PrefixLength: 0 })).toThrow(RangeError);
  });

  it("refuses to put address-less requests in one shared 'unknown' bucket", () => {
    expect(() => defaultKeyGenerator({})).toThrow();
    expect(() => defaultKeyGenerator({ ip: "unknown" })).toThrow();
    const limiter = createRateLimiter({ max: 1, windowMs: 60_000 });
    try {
      expect(() => limiter.check({})).toThrow(/RateLimitRequest\.ip/);
    } finally {
      limiter.destroy();
    }
  });
});
