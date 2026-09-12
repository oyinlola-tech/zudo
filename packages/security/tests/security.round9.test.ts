/**
 * Regression tests for the round-9 audit findings (SEC-R9-*).
 */

import { describe, it, expect, vi, afterEach } from "vitest";

import { createRateLimiter } from "../src/rateLimit/index.js";
import { validateBodyFraming } from "../src/body/index.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("SEC-R9-01: a window longer than 2^31 - 1 ms does not overflow the cleanup timer", () => {
  it("emits no TimeoutOverflowWarning for a 30-day window", async () => {
    const warnings: string[] = [];
    const onWarning = (warning: Error): void => {
      warnings.push(warning.name);
    };
    process.on("warning", onWarning);

    const limiter = createRateLimiter({
      max: 5,
      windowMs: 30 * 24 * 60 * 60 * 1000,
    });

    try {
      // `process.emitWarning` delivers asynchronously.
      await new Promise((resolve) => setImmediate(resolve));
      expect(warnings).not.toContain("TimeoutOverflowWarning");
    } finally {
      process.off("warning", onWarning);
      limiter.destroy();
    }
  });

  it("clamps the cleanup interval instead of sweeping every millisecond", () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(globalThis, "setInterval");

    const limiter = createRateLimiter({ max: 5, windowMs: 2 ** 40 });

    try {
      const delay = spy.mock.calls.at(-1)?.[1];
      expect(delay).toBe(2 ** 31 - 1);
    } finally {
      spy.mockRestore();
      limiter.destroy();
    }
  });
});

describe("SEC-R9-02: key-cap eviction is O(1) and stays least-recently-seen", () => {
  it("evicts the least recently seen key, not the least recently created", () => {
    const limiter = createRateLimiter({ max: 5, windowMs: 60_000, maxKeys: 3 });

    try {
      limiter.check({ ip: "a" });
      limiter.check({ ip: "b" });
      limiter.check({ ip: "c" });
      // Touch "a" so it is the most recently seen; "b" is now the oldest.
      limiter.check({ ip: "a" });
      limiter.check({ ip: "d" });

      expect(limiter.size).toBe(3);
      expect(limiter.getCount("b")).toBe(0);
      expect(limiter.getCount("a")).toBe(2);
      expect(limiter.getCount("c")).toBe(1);
      expect(limiter.getCount("d")).toBe(1);
    } finally {
      limiter.destroy();
    }
  });

  it("does not sort the whole store for every rotated key past the cap", () => {
    const cap = 50_000;
    const limiter = createRateLimiter({ max: 5, windowMs: 60_000, maxKeys: cap });

    try {
      for (let i = 0; i < cap; i++) limiter.check({ ip: `k${i}` });

      // Before the fix each of these copied and sorted 50k entries
      // (~10 ms each, so ~20 s here); now each is a single Map delete.
      const started = performance.now();
      for (let i = 0; i < 2_000; i++) limiter.check({ ip: `rot${i}` });
      const elapsed = performance.now() - started;

      expect(limiter.size).toBe(cap);
      expect(elapsed).toBeLessThan(2_000);
    } finally {
      limiter.destroy();
    }
  });
});

describe("SEC-R9-03: validateBodyFraming checks a repeated Transfer-Encoding field", () => {
  it("rejects an array whose final coding is not chunked", () => {
    expect(validateBodyFraming({ "transfer-encoding": ["gzip"] })).toMatch(
      /must end with "chunked"/,
    );
    expect(
      validateBodyFraming({ "transfer-encoding": ["chunked", "gzip"] }),
    ).toMatch(/must end with "chunked"/);
  });

  it("accepts an array whose final coding is chunked", () => {
    expect(
      validateBodyFraming({ "transfer-encoding": ["gzip", "chunked"] }),
    ).toBeUndefined();
    expect(validateBodyFraming({ "Transfer-Encoding": ["chunked"] })).toBeUndefined();
  });
});
