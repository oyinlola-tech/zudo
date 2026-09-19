/**
 * Audit round 10 regressions for @zudojs/auth-oauth.
 */

import { describe, it, expect } from "vitest";

import {
  assertSafeUrl,
  isBlockedFetchHost,
} from "../src/oauthSecurity/index.js";

describe("security/SEC-06", () => {
  it.each([
    "https://[::127.0.0.1]/token",
    "https://[::169.254.169.254]/token",
    "https://[64:ff9b::169.254.169.254]/token",
    "https://[::ffff:0:a9fe:a9fe]/token",
    "https://[2002:a9fe:a9fe::]/token",
    "https://[64:ff9b:1::1]/token",
  ])("the fetch guard refuses %s", (url) => {
    expect(isBlockedFetchHost(new URL(url).hostname)).toBe(true);
    expect(() => assertSafeUrl(url, "tokenUrl", "fetch")).toThrow();
  });

  it("public IPv6 and public NAT64 targets are still allowed", () => {
    expect(isBlockedFetchHost("[2606:4700:4700::1111]")).toBe(false);
    expect(isBlockedFetchHost("[64:ff9b::808:808]")).toBe(false);
  });
});
