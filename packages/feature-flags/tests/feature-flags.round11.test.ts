/**
 * @zudojs/feature-flags — Audit round 11 regression tests.
 *
 * One describe block per finding.
 */

import { describe, it, expect, vi } from "vitest";

import {
  createFeatureFlags,
  valuesEqual,
  FeatureFlagProviderError,
  type FeatureFlag,
  type FeatureFlagProvider,
} from "../src/index.js";

/** A provider whose every call rejects, counting the attempts. */
function deadProvider(): FeatureFlagProvider & {
  readonly calls: { getAll: number; get: number };
} {
  const calls = { getAll: 0, get: 0 };
  return {
    calls,
    async getAll(): Promise<readonly FeatureFlag[]> {
      calls.getAll += 1;
      throw new Error("store unreachable");
    },
    async get(): Promise<FeatureFlag | undefined> {
      calls.get += 1;
      throw new Error("store unreachable");
    },
  };
}

describe("TOOL-03 — valuesEqual compares structurally", () => {
  it("ignores key order", () => {
    expect(valuesEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
  });

  it("distinguishes an undefined-valued key from an absent one", () => {
    expect(valuesEqual({ a: undefined }, {})).toBe(false);
    expect(valuesEqual({}, { a: undefined })).toBe(false);
    expect(valuesEqual({ a: undefined }, { a: undefined })).toBe(true);
  });

  it("compares two self-referencing values without throwing", () => {
    const a: Record<string, unknown> = { name: "a" };
    a["self"] = a;
    const b: Record<string, unknown> = { name: "a" };
    b["self"] = b;

    expect(valuesEqual(a, b)).toBe(true);

    const c: Record<string, unknown> = { name: "c" };
    c["self"] = c;
    expect(valuesEqual(a, c)).toBe(false);
  });

  it("compares nested arrays element-wise", () => {
    expect(valuesEqual({ xs: [1, { y: 2 }] }, { xs: [1, { y: 2 }] })).toBe(
      true,
    );
    expect(valuesEqual({ xs: [1, 2] }, { xs: [2, 1] })).toBe(false);
    expect(valuesEqual({ xs: [1] }, { xs: [1, 2] })).toBe(false);
  });

  it("keeps the primitive and null cases", () => {
    expect(valuesEqual(true, true)).toBe(true);
    expect(valuesEqual("a", "a")).toBe(true);
    expect(valuesEqual(1, "1")).toBe(false);
    expect(valuesEqual(null, null)).toBe(true);
    expect(valuesEqual(null, {})).toBe(false);
    expect(valuesEqual(Number.NaN, Number.NaN)).toBe(true);
  });
});

describe("TOOL-04 — a bulk read during an outage is not an empty result", () => {
  it("rejects snapshot() when the provider was never loaded", async () => {
    const provider = deadProvider();
    const flags = createFeatureFlags({ provider, onError: () => undefined });

    await expect(flags.snapshot()).rejects.toBeInstanceOf(
      FeatureFlagProviderError,
    );
  });

  it("rejects getAll() when the provider was never loaded", async () => {
    const provider = deadProvider();
    const flags = createFeatureFlags({ provider, onError: () => undefined });

    await expect(flags.getAll()).rejects.toBeInstanceOf(
      FeatureFlagProviderError,
    );
  });

  it("still resolves both when the provider simply holds no flags", async () => {
    const provider: FeatureFlagProvider = {
      getAll: async () => [],
      get: async () => undefined,
    };
    const flags = createFeatureFlags({ provider });

    expect((await flags.snapshot()).size).toBe(0);
    expect(await flags.getAll()).toEqual([]);
  });

  it("serves the last good data once a load has succeeded", async () => {
    let fail = false;
    const flag: FeatureFlag = {
      key: "beta",
      enabled: true,
      defaultValue: true,
      visibility: "client",
    };
    const provider: FeatureFlagProvider = {
      async getAll() {
        if (fail) throw new Error("store unreachable");
        return [flag];
      },
      async get() {
        if (fail) throw new Error("store unreachable");
        return flag;
      },
    };
    const flags = createFeatureFlags({ provider, onError: () => undefined });

    expect(await flags.getAll()).toHaveLength(1);
    fail = true;
    expect((await flags.snapshot()).size).toBe(1);
  });
});

describe("TOOL-09 — a failing provider is probed at most once per cool-off", () => {
  it("does not re-query the provider for every evaluation", async () => {
    const provider = deadProvider();
    const onError = vi.fn();
    const flags = createFeatureFlags({
      provider,
      onError,
      providerCooloffMs: 60_000,
    });

    for (let i = 0; i < 5; i++) {
      const result = await flags.evaluate("beta");
      expect(result.reason).toBe("error");
      expect(result.value).toBeUndefined();
    }

    expect(provider.calls.getAll).toBe(1);
    expect(provider.calls.get).toBe(0);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("probes again once the window closes", async () => {
    vi.useFakeTimers();
    try {
      const provider = deadProvider();
      const flags = createFeatureFlags({
        provider,
        onError: () => undefined,
        providerCooloffMs: 1_000,
      });

      await flags.evaluate("beta");
      await flags.evaluate("beta");
      expect(provider.calls.getAll).toBe(1);

      vi.setSystemTime(Date.now() + 2_000);
      await flags.evaluate("beta");
      expect(provider.calls.getAll).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps probing on every evaluation when the cool-off is disabled", async () => {
    const provider = deadProvider();
    const flags = createFeatureFlags({
      provider,
      onError: () => undefined,
      providerCooloffMs: 0,
    });

    await flags.evaluate("beta");
    await flags.evaluate("beta");
    await flags.evaluate("beta");

    expect(provider.calls.getAll).toBe(3);
    expect(provider.calls.get).toBe(3);
  });

  it("clears the window as soon as the provider answers again", async () => {
    let fail = true;
    const calls = { getAll: 0 };
    const provider: FeatureFlagProvider = {
      async getAll() {
        calls.getAll += 1;
        if (fail) throw new Error("store unreachable");
        return [
          { key: "beta", enabled: true, defaultValue: true } as FeatureFlag,
        ];
      },
      async get() {
        return undefined;
      },
    };
    const flags = createFeatureFlags({
      provider,
      onError: () => undefined,
      providerCooloffMs: 60_000,
    });

    expect((await flags.evaluate("beta")).reason).toBe("error");
    fail = false;
    await flags.refresh();

    expect((await flags.evaluate("beta")).value).toBe(true);
    expect(calls.getAll).toBe(2);
  });
});
