/**
 * Round 12 regressions for @zudojs/security (academy finding #139).
 */

import { describe, it, expect } from "vitest";
import { createRateLimiter } from "../src/index.js";

const request = { ip: "203.0.113.7" };

describe("#139 rate limiter cost does not grow with max", () => {
  it("keeps per-check cost flat when the window holds tens of thousands of hits", () => {
    const limiter = createRateLimiter({
      windowMs: 60_000,
      max: 1_000_000,
      keyGenerator: () => "k",
    });
    try {
      for (let index = 0; index < 30_000; index += 1) limiter.check(request);
      expect(limiter.getCount("k")).toBe(30_000);

      const started = performance.now();
      for (let index = 0; index < 3_000; index += 1) limiter.check(request);
      const elapsed = performance.now() - started;

      expect(limiter.getCount("k")).toBe(33_000);
      expect(elapsed).toBeLessThan(75);
    } finally {
      limiter.destroy();
    }
  });

  it("still slides: hits leave the window in order and free capacity", () => {
    const limiter = createRateLimiter({
      windowMs: 1_000,
      max: 3,
      keyGenerator: () => "k",
    });
    try {
      const realNow = Date.now;
      let now = 1_000_000;
      Date.now = () => now;
      try {
        expect(limiter.check(request).allowed).toBe(true);
        now += 400;
        expect(limiter.check(request).allowed).toBe(true);
        expect(limiter.check(request).allowed).toBe(true);
        const denied = limiter.check(request);
        expect(denied.allowed).toBe(false);
        expect(denied.remaining).toBe(0);
        expect(denied.resetAt.getTime()).toBe(1_000_000 + 1_000);

        now += 601;
        const freed = limiter.check(request);
        expect(freed.allowed).toBe(true);
        expect(limiter.getCount("k")).toBe(3);
        expect(limiter.check(request).allowed).toBe(false);
      } finally {
        Date.now = realNow;
      }
    } finally {
      limiter.destroy();
    }
  });
});
