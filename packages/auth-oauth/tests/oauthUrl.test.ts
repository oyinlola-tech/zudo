import { describe, expect, it } from "vitest";

import {
  assertSafeUrl,
  isBlockedFetchHost,
  OAuthEndpointNotAllowedError,
  resolveConfig,
  resolveTokenUrl,
} from "../src/index.js";
import { makeConfig } from "./helpers.js";

describe("URL guard", () => {
  it("accepts a plain https endpoint", () => {
    expect(assertSafeUrl("https://oauth2.googleapis.com/token", "tokenUrl", "fetch").host).toBe(
      "oauth2.googleapis.com",
    );
  });

  it("rejects http for a server-fetched endpoint, even on localhost", () => {
    expect(() =>
      assertSafeUrl("http://localhost:8080/token", "tokenUrl", "fetch"),
    ).toThrow(OAuthEndpointNotAllowedError);
  });

  it("allows http on localhost for a browser-facing URL only", () => {
    expect(assertSafeUrl("http://localhost:3000/cb", "redirectUri", "browser").protocol).toBe(
      "http:",
    );
    expect(assertSafeUrl("http://127.0.0.1:3000/cb", "redirectUri", "browser").protocol).toBe(
      "http:",
    );
    expect(() =>
      assertSafeUrl("http://evil.example.com/cb", "redirectUri", "browser"),
    ).toThrow(OAuthEndpointNotAllowedError);
  });

  it.each([
    "javascript:alert(1)",
    "file:///etc/passwd",
    "data:text/html,x",
    "ftp://example.com/",
    "not-a-url",
    "",
  ])("rejects the non-https URL %s", (raw) => {
    expect(() => assertSafeUrl(raw, "tokenUrl", "fetch")).toThrow(
      OAuthEndpointNotAllowedError,
    );
  });

  it("rejects URLs carrying credentials", () => {
    expect(() =>
      assertSafeUrl("https://user:pass@example.com/token", "tokenUrl", "fetch"),
    ).toThrow(OAuthEndpointNotAllowedError);
    expect(() =>
      assertSafeUrl("https://user@example.com/token", "tokenUrl", "fetch"),
    ).toThrow(OAuthEndpointNotAllowedError);
  });

  it.each([
    ["cloud metadata", "https://169.254.169.254/latest/meta-data/"],
    ["gcp metadata name", "https://metadata.google.internal/computeMetadata/v1/"],
    ["loopback v4", "https://127.0.0.1/token"],
    ["loopback v6", "https://[::1]/token"],
    ["unspecified", "https://0.0.0.0/token"],
    ["private 10/8", "https://10.1.2.3/token"],
    ["private 172.16/12", "https://172.20.0.5/token"],
    ["private 192.168/16", "https://192.168.1.1/token"],
    ["cgnat", "https://100.100.100.200/token"],
    ["unique local v6", "https://[fd00::1]/token"],
    ["link local v6", "https://[fe80::1]/token"],
    ["v4-mapped loopback", "https://[::ffff:127.0.0.1]/token"],
    ["localhost name", "https://localhost/token"],
    ["mdns name", "https://printer.local/token"],
    ["internal name", "https://vault.internal/token"],
  ])("blocks %s as an SSRF target", (_label, raw) => {
    expect(() => assertSafeUrl(raw, "tokenUrl", "fetch")).toThrow(
      OAuthEndpointNotAllowedError,
    );
  });

  it("still allows public hosts that merely look private", () => {
    expect(isBlockedFetchHost("11.0.0.1")).toBe(false);
    expect(isBlockedFetchHost("172.32.0.1")).toBe(false);
    expect(isBlockedFetchHost("169.253.0.1")).toBe(false);
    expect(isBlockedFetchHost("api.github.com")).toBe(false);
  });

  it("applies the guard to a configured token URL before any request", () => {
    const config = makeConfig({
      provider: "custom",
      authorizeUrl: "https://idp.example.com/authorize",
      tokenUrl: "http://169.254.169.254/latest/meta-data/",
      userInfoUrl: "https://idp.example.com/me",
    });
    expect(() => resolveTokenUrl(resolveConfig(config))).toThrow(
      OAuthEndpointNotAllowedError,
    );
  });
});
