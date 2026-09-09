import { describe, expect, it } from "vitest";

import { generateState, verifyState } from "../src/index.js";

describe("state", () => {
  it("generates unguessable, url-safe values", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i += 1) {
      const state = generateState();
      expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/);
      seen.add(state);
    }
    expect(seen.size).toBe(500);
  });

  it("accepts an exact match", () => {
    const state = generateState();
    expect(verifyState(state, state)).toBe(true);
  });

  it("rejects a one-character difference at equal length", () => {
    const state = `${"a".repeat(42)}b`;
    const tampered = `${"a".repeat(42)}c`;
    expect(verifyState(state, tampered)).toBe(false);
  });

  it("rejects unequal lengths without throwing", () => {
    // timingSafeEqual throws on unequal buffers; the length check comes first.
    expect(() => verifyState("abcdef", "abcde")).not.toThrow();
    expect(verifyState("abcdef", "abcde")).toBe(false);
    expect(verifyState("abcde", "abcdef")).toBe(false);
  });

  it("rejects empty and missing values", () => {
    expect(verifyState("", "")).toBe(false);
    expect(verifyState("abc", "")).toBe(false);
    expect(verifyState("", "abc")).toBe(false);
    expect(verifyState(undefined as unknown as string, "abc")).toBe(false);
    expect(verifyState("abc", null as unknown as string)).toBe(false);
  });

  it("compares bytes, not unicode-normalised forms", () => {
    expect(verifyState("é", "é")).toBe(false);
  });
});
