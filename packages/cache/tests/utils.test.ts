/**
 * @zudojs/cache — Utils Tests
 *
 * Tests for the glob matcher (including adversarial patterns), pattern
 * validation, the monotonic clock, and TTL validation.
 */

import { describe, it, expect } from "vitest";

import {
  assertValidPattern,
  assertValidPatternPart,
  assertValidTtl,
  createGlobMatcher,
  deleteManyViaDelete,
  monotonicNow,
  wallClockFor,
} from "../src/utils.js";
import { MAX_KEY_LENGTH } from "../src/constants.js";
import { isCacheError } from "../src/errors.js";

// ─── Glob semantics ────────────────────────────────────────────────────────

describe("createGlobMatcher", () => {
  it("matches literals exactly", () => {
    const matches = createGlobMatcher("user.1");
    expect(matches("user.1")).toBe(true);
    expect(matches("user.2")).toBe(false);
    expect(matches("user.10")).toBe(false);
  });

  it("matches a run of characters with *", () => {
    const matches = createGlobMatcher("user.*");
    expect(matches("user.1")).toBe(true);
    expect(matches("user.abc")).toBe(true);
    expect(matches("post.1")).toBe(false);
  });

  it("matches exactly one character with ?", () => {
    const matches = createGlobMatcher("user.?");
    expect(matches("user.1")).toBe(true);
    expect(matches("user.12")).toBe(false);
  });

  it("matches within a segment across the separator boundary", () => {
    const matches = createGlobMatcher("zudojs:user.*");
    expect(matches("zudojs:user.1")).toBe(true);
    expect(matches("zudojs:tenant:user.1")).toBe(false);
  });

  // Regression (CACHE-01, pattern side): `*` must not cross the separator,
  // or a service with no namespace could wipe every namespaced key with
  // invalidateByPattern("*").
  it("does not let * escape its own key segment", () => {
    const matches = createGlobMatcher("zudojs:*");
    expect(matches("zudojs:plain")).toBe(true);
    expect(matches("zudojs:tenant-a:secret")).toBe(false);
  });

  it("spans whole segments only with an explicit ** segment", () => {
    const matches = createGlobMatcher("zudojs:**");
    expect(matches("zudojs:plain")).toBe(true);
    expect(matches("zudojs:tenant-a:secret")).toBe(true);
    expect(matches("other:plain")).toBe(false);
  });

  it("honours a custom separator", () => {
    const matches = createGlobMatcher("zudojs|*", { separator: "|" });
    expect(matches("zudojs|plain")).toBe(true);
    expect(matches("zudojs|ns|deep")).toBe(false);
  });

  it("requires a full match, not a prefix match", () => {
    const matches = createGlobMatcher("user");
    expect(matches("user.1")).toBe(false);
    expect(matches("user")).toBe(true);
  });
});

// ─── Adversarial patterns (ReDoS) ──────────────────────────────────────────

describe("createGlobMatcher — adversarial patterns", () => {
  // Regression (CACHE-02): the previous glob→RegExp translation turned every
  // `*` into `.*` with no bound, so a 24-star pattern that fails to match
  // did not complete within 30 seconds and pinned the event loop. The
  // matcher is linear, so this must finish in milliseconds.
  it(
    "matches a 24-star non-matching pattern in bounded time",
    { timeout: 5_000 },
    () => {
      const pattern = `${"*".repeat(24)}x`;
      const value = "a".repeat(60);
      const start = performance.now();
      const matches = createGlobMatcher(pattern);
      const result = matches(value);
      const elapsed = performance.now() - start;
      expect(result).toBe(false);
      expect(elapsed).toBeLessThan(500);
    },
  );

  it(
    "matches an alternating *? pattern in bounded time",
    { timeout: 5_000 },
    () => {
      const pattern = `${"*?".repeat(40)}x`;
      const value = "a".repeat(200);
      const start = performance.now();
      const matches = createGlobMatcher(pattern);
      const result = matches(value);
      const elapsed = performance.now() - start;
      expect(result).toBe(false);
      expect(elapsed).toBeLessThan(500);
    },
  );

  it(
    "scans a whole keyspace with a pathological pattern in bounded time",
    { timeout: 10_000 },
    () => {
      const matches = createGlobMatcher(`${"*".repeat(24)}x`);
      const keys = Array.from(
        { length: 2_000 },
        (_, i) => `key.${i}.${"a".repeat(50)}`,
      );
      const start = performance.now();
      for (const key of keys) matches(key);
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(1_000);
    },
  );

  it("collapses star runs so a long star pattern still behaves correctly", () => {
    const matches = createGlobMatcher(`${"*".repeat(24)}x`);
    expect(matches("aaax")).toBe(true);
    expect(matches("aaay")).toBe(false);
  });
});

// ─── Pattern validation ────────────────────────────────────────────────────

describe("assertValidPattern", () => {
  it("rejects an empty pattern", () => {
    expect(() => assertValidPattern("")).toThrow();
  });

  it("rejects a pattern longer than MAX_KEY_LENGTH", () => {
    expect(() => assertValidPattern("*".repeat(MAX_KEY_LENGTH + 1))).toThrow();
  });

  it("accepts a pattern at the limit", () => {
    expect(() => assertValidPattern("a".repeat(MAX_KEY_LENGTH))).not.toThrow();
  });
});

describe("assertValidPatternPart", () => {
  it("accepts the key alphabet plus * and ?", () => {
    expect(() => assertValidPatternPart("user.*_a-1?", ":")).not.toThrow();
  });

  it("rejects the separator", () => {
    expect(() => assertValidPatternPart("a:b", ":")).toThrow();
  });

  it("rejects characters outside the pattern alphabet", () => {
    expect(() => assertValidPatternPart("a b", ":")).toThrow();
    expect(() => assertValidPatternPart("a/b", ":")).toThrow();
  });
});

// ─── Monotonic clock ───────────────────────────────────────────────────────

describe("monotonicNow", () => {
  it("never goes backwards", () => {
    const a = monotonicNow();
    const b = monotonicNow();
    expect(b).toBeGreaterThanOrEqual(a);
  });

  it("converts to an approximate wall-clock Date", () => {
    const date = wallClockFor(monotonicNow());
    expect(date).toBeInstanceOf(Date);
    expect(Math.abs(date.getTime() - Date.now())).toBeLessThan(5_000);
  });
});

// ─── TTL validation ────────────────────────────────────────────────────────

describe("assertValidTtl", () => {
  it("accepts null and undefined", () => {
    expect(() => assertValidTtl(null)).not.toThrow();
    expect(() => assertValidTtl(undefined)).not.toThrow();
  });

  // Regression (CACHE-14): the code was smuggled into metadata.errorCode,
  // so the obvious `e.code === "CACHE_INVALID_TTL"` handler never matched.
  it("sets CACHE_INVALID_TTL as the error code", () => {
    try {
      assertValidTtl(0);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(isCacheError(error)).toBe(true);
      expect((error as { code: string }).code).toBe("CACHE_INVALID_TTL");
      expect(
        (error as { metadata: Record<string, unknown> }).metadata.ttl,
      ).toBe(0);
    }
  });

  it("rejects negative, zero, non-finite and oversized TTLs", () => {
    expect(() => assertValidTtl(-1)).toThrow();
    expect(() => assertValidTtl(0)).toThrow();
    expect(() => assertValidTtl(Number.NaN)).toThrow();
    expect(() => assertValidTtl(25 * 60 * 60 * 1000)).toThrow();
  });
});

// ─── deleteManyViaDelete ───────────────────────────────────────────────────

describe("deleteManyViaDelete", () => {
  it("reports only the keys that were actually deleted", async () => {
    const present = new Set(["a", "c"]);
    const result = await deleteManyViaDelete(["a", "b", "c"], async (key) => ({
      deleted: present.has(key),
      key,
    }));
    expect(result.deleted).toBe(2);
    expect([...result.keys]).toEqual(["a", "c"]);
  });
});
