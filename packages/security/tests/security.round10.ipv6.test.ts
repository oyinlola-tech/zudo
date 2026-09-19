/**
 * Audit round 10 phase 2: the IPv6 helpers behind the SSRF guard are public
 * (security/SEC-06), so @zudojs/auth-oauth can share them instead of
 * mirroring them.
 */

import { describe, it, expect } from "vitest";

import {
  embeddedIpv4,
  expandIpv6,
  isNonPublicIpv6Range,
} from "../src/index.js";

describe("security/SEC-06 (phase 2): exported IPv6 helpers", () => {
  it("expandIpv6 expands compressed, dotted and zoned forms", () => {
    expect(expandIpv6("::1")).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
    expect(expandIpv6("::ffff:10.0.0.1")).toEqual([
      0, 0, 0, 0, 0, 0xffff, 0x0a00, 0x0001,
    ]);
    expect(expandIpv6("fe80::1%eth0")).toEqual([0xfe80, 0, 0, 0, 0, 0, 0, 1]);
    expect(expandIpv6("not-an-ip")).toBeUndefined();
  });

  it("embeddedIpv4 recovers the IPv4 from every embedding form", () => {
    const of = (a: string): number[] | undefined =>
      embeddedIpv4(expandIpv6(a)!);
    expect(of("::7f00:1")).toEqual([127, 0, 0, 1]);
    expect(of("::ffff:169.254.169.254")).toEqual([169, 254, 169, 254]);
    expect(of("::ffff:0:10.1.2.3")).toEqual([10, 1, 2, 3]);
    expect(of("64:ff9b::192.168.0.1")).toEqual([192, 168, 0, 1]);
    expect(of("2002:0a00:0001::")).toEqual([10, 0, 0, 1]);
    expect(of("2001:db8::1")).toBeUndefined();
  });

  it("isNonPublicIpv6Range flags ULA, link/site-local, multicast and local NAT64", () => {
    for (const a of ["fc00::1", "fe80::1", "fec0::1", "ff02::1", "64:ff9b:1::1"]) {
      expect(isNonPublicIpv6Range(expandIpv6(a)!)).toBe(true);
    }
    expect(isNonPublicIpv6Range(expandIpv6("2606:4700::1111")!)).toBe(false);
  });
});
