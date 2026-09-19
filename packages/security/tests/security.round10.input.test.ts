/**
 * Audit round 10 regressions for @zudojs/security: body limits, cookies,
 * URL guard and input heuristics.
 */

import { describe, it, expect } from "vitest";

import {
  containsSqlInjection,
  containsXss,
  createBodySizeChecker,
  isSafeUrl,
  stripSensitiveCookies,
  validateBodyLimitConfig,
  validateBodySize,
  validateContentLength,
} from "../src/index.js";

describe("security/SEC-03", () => {
  it("a NaN limit is rejected instead of disabling the check", () => {
    expect(validateBodyLimitConfig({ maxSize: Number.NaN })).toMatch(/finite|positive/);
    expect(validateBodyLimitConfig({ maxSize: Infinity })).toBeDefined();
    expect(() => validateBodySize(5e9, Number.NaN)).toThrow();
    expect(() => createBodySizeChecker(Number(undefined))).toThrow();
    expect(() => validateContentLength("5000000000", Number.NaN)).toThrow();
  });

  it("a finite limit still works, and a NaN size is refused", () => {
    expect(validateBodySize(10, 100)).toBeUndefined();
    expect(validateBodySize(101, 100)).toBeDefined();
    expect(validateBodySize(Number.NaN, 100)).toBeDefined();
    expect(createBodySizeChecker(100)(50).allowed).toBe(true);
  });
});

describe("security/SEC-05", () => {
  it("strips the real-world session cookie names", () => {
    const header =
      "connect.sid=S1; __Host-session=S2; __Secure-next-auth.session-token=S3; " +
      "access_token=S4; refresh_token=S5; sid=S6; PHPSESSID=S7; sessionId=S8; theme=dark; sidebar=open";
    expect(stripSensitiveCookies(header)).toBe("theme=dark; sidebar=open");
  });

  it("keeps the old prefix behaviour and custom names", () => {
    expect(stripSensitiveCookies("session_id=a; keep=b")).toBe("keep=b");
    expect(stripSensitiveCookies("my-api-key=a; keep=b", ["api-key"])).toBe("keep=b");
  });
});

describe("security/SEC-06", () => {
  it.each([
    "http://[::127.0.0.1]/",
    "http://[::169.254.169.254]/",
    "http://[64:ff9b::169.254.169.254]/",
    "http://[::ffff:0:a9fe:a9fe]/",
    "http://[::ffff:127.0.0.1]/",
    "http://[2002:7f00:1::]/",
    "http://[64:ff9b:1::1]/",
    "http://[ff02::1]/",
  ])("refuses %s", (url) => {
    expect(isSafeUrl(url)).toBe(false);
  });

  it("still allows public IPv6 and public embedded IPv4", () => {
    expect(isSafeUrl("https://[2606:4700:4700::1111]/")).toBe(true);
    expect(isSafeUrl("https://[64:ff9b::808:808]/")).toBe(true);
  });
});

describe("security/SEC-07", () => {
  it.each(["admin' OR 1=1", "x' || pg_sleep(10) || '"])("flags SQL %s", (payload) => {
    expect(containsSqlInjection(payload)).toBe(true);
  });

  it.each([
    '<a href="jav&#x61;script:alert(1)">',
    '<a href="java&#x09;script:alert(1)">',
    '<svg><a xlink:href="&#106;avascript:alert(1)">',
    '<a href="javascript&colon;alert(1)">',
  ])("flags entity-encoded XSS %s", (payload) => {
    expect(containsXss(payload)).toBe(true);
  });

  it("leaves ordinary text alone", () => {
    expect(containsXss("Fish &amp; chips at 5 o'clock")).toBe(false);
    expect(containsSqlInjection("Nice weather today")).toBe(false);
  });
});
