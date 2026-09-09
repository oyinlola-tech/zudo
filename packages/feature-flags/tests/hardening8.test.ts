/**
 * Regression coverage for the round-8 audit findings (FLAGS-xx).
 */

import { describe, it, expect } from "vitest";

import {
  createFeatureFlags,
  createMemoryProvider,
  createFeatureFlagRegistry,
  evaluateFlag,
  evaluateRule,
  resolveDependencies,
  resolvePath,
  matchAttribute,
  getBucket,
} from "../src/index.js";
import type {
  FeatureFlag,
  FeatureFlagProvider,
  FeatureFlagVariant,
} from "../src/index.js";

// ─── FLAGS-01 · Variant assignment actually uses the weights ───────────────

describe("variant rules", () => {
  const variants: readonly FeatureFlagVariant[] = [
    { key: "control", weight: 50 },
    { key: "treatment", weight: 50 },
  ];

  const assign = (userId: string): string | undefined =>
    evaluateRule({ type: "variant", variants }, { userId }, "exp").variant;

  it("does not put every subject in the last variant (FLAGS-01)", () => {
    const seen = new Set<string | undefined>();
    for (let i = 0; i < 500; i++) seen.add(assign(`user-${i}`));
    expect(seen).toEqual(new Set(["control", "treatment"]));
  });

  it("splits close to the declared weights (FLAGS-01)", () => {
    let control = 0;
    const total = 4_000;
    for (let i = 0; i < total; i++) {
      if (assign(`user-${i}`) === "control") control++;
    }
    const share = control / total;
    expect(share).toBeGreaterThan(0.4);
    expect(share).toBeLessThan(0.6);
  });

  it("is stable for the same subject (FLAGS-01)", () => {
    const first = assign("ada");
    for (let i = 0; i < 20; i++) expect(assign("ada")).toBe(first);
  });

  it("honours an uneven split (FLAGS-01)", () => {
    const skewed: readonly FeatureFlagVariant[] = [
      { key: "a", weight: 90 },
      { key: "b", weight: 10 },
    ];
    let a = 0;
    const total = 4_000;
    for (let i = 0; i < total; i++) {
      const result = evaluateRule(
        { type: "variant", variants: skewed },
        { userId: `user-${i}` },
        "exp",
      );
      if (result.variant === "a") a++;
    }
    expect(a / total).toBeGreaterThan(0.85);
    expect(a / total).toBeLessThan(0.95);
  });

  it("treats a zero or negative weight as unassignable (FLAGS-01)", () => {
    const result = evaluateRule(
      {
        type: "variant",
        variants: [
          { key: "never", weight: -10 },
          { key: "always", weight: 5 },
        ],
      },
      { userId: "ada" },
      "exp",
    );
    expect(result.variant).toBe("always");
  });

  it("does not match when every weight is zero (FLAGS-01)", () => {
    expect(
      evaluateRule(
        { type: "variant", variants: [{ key: "a", weight: 0 }] },
        { userId: "ada" },
        "exp",
      ).matched,
    ).toBe(false);
  });

  it("buckets deterministically per (flag, subject) (FLAGS-01)", () => {
    expect(getBucket("exp", "ada")).toBe(getBucket("exp", "ada"));
    expect(getBucket("exp", "ada")).not.toBe(getBucket("other", "ada"));
  });
});

// ─── FLAGS-02 · Dependencies that are satisfied enable the flag ────────────

describe("dependencies", () => {
  const withDeps: readonly FeatureFlag[] = [
    { key: "base", enabled: true, defaultValue: true },
    {
      key: "child",
      enabled: true,
      defaultValue: false,
      dependencies: ["base"],
      rules: [{ type: "static", value: true }],
    },
  ];

  it("evaluates a flag whose dependency is enabled (FLAGS-02)", async () => {
    const flags = createFeatureFlags({
      provider: createMemoryProvider(withDeps),
    });
    const result = await flags.evaluate("child");
    expect(result.reason).toBe("static");
    expect(result.value).toBe(true);
  });

  it("still refuses when the dependency is disabled (FLAGS-02)", async () => {
    const flags = createFeatureFlags({
      provider: createMemoryProvider([
        { key: "base", enabled: false, defaultValue: true },
        withDeps[1]!,
      ]),
    });
    const result = await flags.evaluate("child");
    expect(result.reason).toBe("dependency_disabled");
    expect(result.value).toBe(false);
  });

  it("resolves a diamond rather than calling it a cycle (FLAGS-03)", () => {
    const registry = createFeatureFlagRegistry([
      { key: "d", enabled: true, defaultValue: true },
      { key: "b", enabled: true, defaultValue: true, dependencies: ["d"] },
      { key: "c", enabled: true, defaultValue: true, dependencies: ["d"] },
      { key: "a", enabled: true, defaultValue: true, dependencies: ["b", "c"] },
    ]);
    expect(resolveDependencies("a", registry)).toBe(true);
  });

  it("still detects a real cycle (FLAGS-03)", () => {
    const registry = createFeatureFlagRegistry([
      { key: "a", enabled: true, defaultValue: true, dependencies: ["b"] },
      { key: "b", enabled: true, defaultValue: true, dependencies: ["a"] },
    ]);
    expect(resolveDependencies("a", registry)).toBe(false);
  });
});

// ─── FLAGS-04 · Targeting cannot walk the prototype chain ──────────────────

describe("attribute targeting safety", () => {
  it("does not resolve prototype members (FLAGS-04)", () => {
    expect(resolvePath({}, "toString")).toBeUndefined();
    expect(resolvePath({}, "constructor")).toBeUndefined();
    expect(resolvePath({}, "__proto__")).toBeUndefined();
    expect(resolvePath({}, "constructor.prototype")).toBeUndefined();
    expect(resolvePath({ a: { b: 1 } }, "a.b")).toBe(1);
  });

  it("does not turn `exists` into a universal match (FLAGS-04)", () => {
    const flag: FeatureFlag = {
      key: "everyone",
      enabled: true,
      defaultValue: false,
      rules: [
        {
          type: "attribute",
          attribute: "toString",
          operator: "exists",
          value: undefined,
        },
      ],
    };
    expect(evaluateFlag(flag, { userId: "ada" }).value).toBe(false);
  });

  it("ignores a __proto__ key smuggled into attributes (FLAGS-04)", () => {
    const attributes = JSON.parse(
      '{"__proto__": {"admin": true}, "plan": "free"}',
    ) as Record<string, unknown>;

    const flag: FeatureFlag = {
      key: "admin-ui",
      enabled: true,
      defaultValue: false,
      rules: [
        {
          type: "attribute",
          attribute: "__proto__.admin",
          operator: "equals",
          value: true,
        },
      ],
    };

    expect(evaluateFlag(flag, { attributes }).value).toBe(false);
    // And nothing leaked onto the global prototype either.
    expect(({} as Record<string, unknown>)["admin"]).toBeUndefined();
  });
});

// ─── FLAGS-05 · A broken pattern denies rather than throwing ───────────────

describe("the matches operator", () => {
  it("returns false for an uncompilable pattern (FLAGS-05)", () => {
    expect(matchAttribute("anything", "matches", "([")).toBe(false);
  });

  it("rejects an absurdly long pattern (FLAGS-05)", () => {
    expect(matchAttribute("a", "matches", "a".repeat(600))).toBe(false);
  });

  it("does not throw out of flag evaluation (FLAGS-05)", () => {
    const flag: FeatureFlag = {
      key: "broken-pattern",
      enabled: true,
      defaultValue: false,
      rules: [
        {
          type: "attribute",
          attribute: "email",
          operator: "matches",
          value: "(unclosed",
        },
      ],
    };
    expect(() =>
      evaluateFlag(flag, { attributes: { email: "a@b.c" } }),
    ).not.toThrow();
    expect(evaluateFlag(flag, { attributes: { email: "a@b.c" } }).value).toBe(
      false,
    );
  });

  it("still matches a valid pattern, repeatedly (FLAGS-05)", () => {
    expect(
      matchAttribute("ada@example.com", "matches", "@example\\.com$"),
    ).toBe(true);
    expect(matchAttribute("ada@other.com", "matches", "@example\\.com$")).toBe(
      false,
    );
  });
});

// ─── FLAGS-06 · isEnabled is a boolean, not a truthiness test ──────────────

describe("isEnabled", () => {
  it("does not report a non-boolean value as enabled (FLAGS-06)", async () => {
    const flags = createFeatureFlags({
      provider: createMemoryProvider([
        { key: "theme", enabled: true, defaultValue: "dark" },
        { key: "ratio", enabled: true, defaultValue: 0.5 },
        { key: "off-string", enabled: true, defaultValue: "false" },
        { key: "on", enabled: true, defaultValue: true },
      ]),
    });

    expect(await flags.isEnabled("theme")).toBe(false);
    expect(await flags.isEnabled("ratio")).toBe(false);
    expect(await flags.isEnabled("off-string")).toBe(false);
    expect(await flags.isEnabled("on")).toBe(true);
  });

  it("reports a missing flag as disabled (FLAGS-06)", async () => {
    const flags = createFeatureFlags({ provider: createMemoryProvider([]) });
    expect(await flags.isEnabled("nope")).toBe(false);
  });
});

// ─── FLAGS-07 · An unreachable store never enables anything ────────────────

describe("provider failures", () => {
  const unreachable: FeatureFlagProvider = {
    async get() {
      throw new Error("flag store unreachable");
    },
    async getAll() {
      throw new Error("flag store unreachable");
    },
  };

  it("does not enable a flag when the store is unreachable (FLAGS-07)", async () => {
    const errors: unknown[] = [];
    const flags = createFeatureFlags({
      provider: unreachable,
      onError: (error) => errors.push(error),
    });

    expect(await flags.isEnabled("new-checkout")).toBe(false);
    const result = await flags.evaluate("new-checkout");
    expect(result.reason).toBe("error");
    expect(result.defaulted).toBe(true);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("falls back to the caller's default from getBoolean (FLAGS-07)", async () => {
    const flags = createFeatureFlags({ provider: unreachable });
    expect(await flags.getBoolean("anything", false)).toBe(false);
    expect(await flags.getBoolean("anything", true)).toBe(true);
  });

  it("can be told to rethrow instead (FLAGS-07)", async () => {
    const flags = createFeatureFlags({
      provider: unreachable,
      throwOnProviderError: true,
    });
    await expect(flags.isEnabled("x")).rejects.toThrow("unreachable");
  });

  it("does not re-query a provider that legitimately has no flags (FLAGS-07)", async () => {
    let calls = 0;
    const empty: FeatureFlagProvider = {
      async get() {
        return undefined;
      },
      async getAll() {
        calls++;
        return [];
      },
    };
    const flags = createFeatureFlags({ provider: empty });
    await flags.isEnabled("a");
    await flags.isEnabled("b");
    await flags.isEnabled("c");
    expect(calls).toBe(1);
  });
});

// ─── FLAGS-08 · A flag change reaches an already-loaded instance ───────────

describe("change propagation", () => {
  it("picks up a flag added after the first load (FLAGS-08)", async () => {
    const provider = createMemoryProvider([
      { key: "existing", enabled: true, defaultValue: true },
    ]);
    const flags = createFeatureFlags({ provider });

    expect(await flags.isEnabled("existing")).toBe(true);
    expect(await flags.isEnabled("late")).toBe(false);

    provider.set({ key: "late", enabled: true, defaultValue: true });
    expect(await flags.isEnabled("late")).toBe(true);

    flags.close();
  });

  it("picks up a flag being turned off (FLAGS-08)", async () => {
    const provider = createMemoryProvider([
      { key: "kill-switch", enabled: true, defaultValue: false },
      { key: "always-on", enabled: true, defaultValue: true },
    ]);
    const flags = createFeatureFlags({ provider });
    expect(await flags.isEnabled("always-on")).toBe(true);

    // A disabled flag falls back to its declared default, which here is off.
    provider.set({ key: "always-on", enabled: false, defaultValue: false });
    expect(await flags.isEnabled("always-on")).toBe(false);

    flags.close();
  });

  it("stops listening after close() (FLAGS-08)", async () => {
    const provider = createMemoryProvider([
      { key: "a", enabled: true, defaultValue: true },
    ]);
    const flags = createFeatureFlags({ provider });
    expect(await flags.isEnabled("a")).toBe(true);
    flags.close();

    // "a" is already in the loaded registry, so without the subscription the
    // change cannot reach this instance until refresh() is called.
    provider.set({ key: "a", enabled: false, defaultValue: false });
    expect(await flags.isEnabled("a")).toBe(true);

    await flags.refresh();
    expect(await flags.isEnabled("a")).toBe(false);
  });

  it("exposes set/delete without a cast (FLAGS-09)", async () => {
    const provider = createMemoryProvider([
      { key: "a", enabled: true, defaultValue: true },
    ]);
    expect(provider.delete("a")).toBe(true);
    expect(provider.delete("a")).toBe(false);
    provider.setAll([{ key: "b", enabled: true, defaultValue: true }]);
    expect((await provider.getAll()).map((flag) => flag.key)).toEqual(["b"]);
  });
});

// ─── FLAGS-10 · The README quick start ─────────────────────────────────────

describe("README quick start", () => {
  it("runs exactly as documented (FLAGS-10)", async () => {
    const flags = createFeatureFlags({
      provider: createMemoryProvider([
        {
          key: "new-ui",
          enabled: true,
          defaultValue: false,
          rules: [{ type: "percentage", percentage: 10, value: true }],
        },
        {
          key: "beta-feature",
          enabled: true,
          defaultValue: false,
          rules: [{ type: "user", users: ["user-123"], value: true }],
        },
      ]),
    });

    expect(await flags.isEnabled("beta-feature", { userId: "user-123" })).toBe(
      true,
    );
    expect(await flags.isEnabled("beta-feature", { userId: "user-456" })).toBe(
      false,
    );
    expect(
      typeof (await flags.isEnabled("new-ui", { userId: "user-456" })),
    ).toBe("boolean");

    const targeted = await flags.evaluate("beta-feature", {
      userId: "user-123",
    });
    expect(targeted.reason).toBe("target_match");
  });
});
