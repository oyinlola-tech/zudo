import { describe, expect, it, vi } from "vitest";
import {
  createCachedProvider,
  createFeatureFlags,
  createMemoryProvider,
  isPlainObject,
  matchAttribute,
  type FeatureFlag,
  type FeatureFlagProvider,
} from "../src/index.js";

describe("authz/FF-01", () => {
  const on = [{ type: "static" as const, value: true }];
  const flags: FeatureFlag[] = [
    { key: "legacy-billing", enabled: true, defaultValue: true, state: "archived" },
    { key: "billing-v2-ui", enabled: true, defaultValue: false, dependencies: ["legacy-billing"], rules: on },
    {
      key: "old-api",
      enabled: true,
      defaultValue: true,
      metadata: { expiresAt: new Date("2020-01-01") },
    },
    { key: "old-api-ui", enabled: true, defaultValue: false, dependencies: ["old-api"], rules: on },
    {
      key: "new-api",
      enabled: true,
      defaultValue: false,
      rules: [{ type: "user", users: ["u2"], value: true }],
    },
    { key: "new-api-dashboard", enabled: true, defaultValue: false, dependencies: ["new-api"], rules: on },
  ];

  it("an archived, expired or not-rolled-out prerequisite keeps dependents off", async () => {
    const ff = createFeatureFlags({ provider: createMemoryProvider(flags) });
    expect((await ff.evaluate("billing-v2-ui")).reason).toBe("dependency_disabled");
    expect(await ff.isEnabled("old-api-ui")).toBe(false);
    expect(await ff.isEnabled("new-api-dashboard", { userId: "u1" })).toBe(false);
    expect(await ff.isEnabled("new-api-dashboard", { userId: "u2" })).toBe(true);
  });
});

describe("authz/FF-02", () => {
  const rule = { type: "attribute" as const, attribute: "plan", operator: "equals" as const, value: "pro" };

  it("serves `result`, and never `true` from a non-boolean flag", async () => {
    const ff = createFeatureFlags({
      provider: createMemoryProvider([
        { key: "theme", enabled: true, defaultValue: "light", rules: [rule] },
        { key: "theme2", enabled: true, defaultValue: "light", rules: [{ ...rule, result: "dark" }] },
        { key: "beta", enabled: true, defaultValue: false, rules: [rule] },
      ]),
    });
    const context = { attributes: { plan: "pro" } };
    expect(await ff.get("theme", context)).toBe("light");
    expect(await ff.get("theme2", context)).toBe("dark");
    expect(await ff.isEnabled("beta", context)).toBe(true);
  });
});

describe("authz/FF-03", () => {
  it("refuses a catastrophic pattern and caps the input", () => {
    const start = performance.now();
    expect(matchAttribute(`${"a".repeat(30)}!`, "matches", "^(a+)+$")).toBe(false);
    expect(performance.now() - start).toBeLessThan(250);
    expect(matchAttribute("x".repeat(2000), "matches", "^x+$")).toBe(false);
    expect(matchAttribute("ada@example.com", "matches", "@example\\.com$")).toBe(true);
  });
});

describe("authz/FF-04", () => {
  it("remembers a missing key instead of asking the provider every time", async () => {
    const inner = createMemoryProvider([]);
    const get = vi.spyOn(inner, "get");
    const ff = createFeatureFlags({ provider: inner });
    for (let i = 0; i < 5; i++) await ff.evaluate("nope");
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("bounds the cached provider", async () => {
    const inner: FeatureFlagProvider = {
      get: async () => undefined,
      getAll: async () => [],
    };
    const spy = vi.spyOn(inner, "get");
    const cached = createCachedProvider(inner, { maxEntries: 10 });
    for (let i = 0; i < 50; i++) await cached.get(`k${i}`);
    await cached.get("k0");
    expect(spy).toHaveBeenCalledTimes(51);
    await cached.get("k49");
    expect(spy).toHaveBeenCalledTimes(51);
  });
});

describe("authz/FF-05", () => {
  it("isPlainObject matches @zudojs/types semantics", () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject(Object.create(null))).toBe(true);
    expect(isPlainObject(new Date())).toBe(false);
    expect(isPlainObject(new Map())).toBe(false);
  });
});
