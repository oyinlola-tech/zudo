/**
 * @zudojs/feature-flags — batch 5 bug reports.
 *
 * One describe block per report.
 */

import { describe, it, expect } from "vitest";

import {
  createFeatureFlags,
  createMemoryProvider,
  createEnvironmentProvider,
  createCompositeProvider,
  evaluateFlag,
  type FeatureFlag,
} from "../src/index.js";

describe("the kill switch fails closed", () => {
  it("a disabled boolean flag is off even when its default is true", async () => {
    const flags = createFeatureFlags({
      provider: createMemoryProvider([
        { key: "x", enabled: false, defaultValue: true },
      ]),
    });
    expect(await flags.isEnabled("x")).toBe(false);
    const result = await flags.evaluate("x");
    expect(result.reason).toBe("disabled");
    expect(result.value).toBe(false);
    expect(result.defaulted).toBe(true);
    expect(await flags.getBoolean("x", true)).toBe(false);
  });

  it("a disabled flag's rules never run", () => {
    const flag: FeatureFlag = {
      key: "x",
      enabled: false,
      defaultValue: false,
      rules: [{ type: "static", value: true }],
    };
    expect(evaluateFlag(flag).value).toBe(false);
  });

  it("state: \"disabled\" is a kill switch too", () => {
    const flag: FeatureFlag = {
      key: "x",
      enabled: true,
      state: "disabled",
      defaultValue: true,
      rules: [{ type: "static", value: true }],
    };
    const result = evaluateFlag(flag);
    expect(result.reason).toBe("disabled");
    expect(result.value).toBe(false);
  });

  it("serves a declared offValue", () => {
    const flag: FeatureFlag = {
      key: "checkout",
      enabled: false,
      defaultValue: "variant-b",
      offValue: "control",
      rules: [{ type: "variant", variants: [{ key: "variant-b", weight: 100 }] }],
    };
    const result = evaluateFlag(flag, { userId: "u1" });
    expect(result.value).toBe("control");
    expect(result.variant).toBeUndefined();
  });

  it("falls back to defaultValue for a non-boolean flag with no offValue", async () => {
    const flags = createFeatureFlags({
      provider: createMemoryProvider([
        { key: "theme", enabled: false, defaultValue: "light",
          rules: [{ type: "static", value: "dark" }] },
      ]),
    });
    expect(await flags.get("theme")).toBe("light");
    expect(await flags.isEnabled("theme")).toBe(false);
  });

  it("draft, archived, expired and dependency-blocked flags are off", async () => {
    const past = new Date("2020-01-01");
    const flags = createFeatureFlags({
      provider: createMemoryProvider([
        { key: "draft", enabled: true, state: "draft", defaultValue: true },
        { key: "archived", enabled: true, state: "archived", defaultValue: true },
        { key: "expired", enabled: true, defaultValue: true, metadata: { expiresAt: past } },
        { key: "base", enabled: false, defaultValue: true },
        { key: "child", enabled: true, defaultValue: true, dependencies: ["base"] },
      ]),
    });
    for (const key of ["draft", "archived", "expired", "child"]) {
      expect(await flags.isEnabled(key)).toBe(false);
    }
    expect((await flags.evaluate("child")).reason).toBe("dependency_disabled");
  });

  it("an enabled flag still serves its default", async () => {
    const flags = createFeatureFlags({
      provider: createMemoryProvider([{ key: "x", enabled: true, defaultValue: true }]),
    });
    expect(await flags.isEnabled("x")).toBe(true);
  });
});

describe("the environment provider normalises keys", () => {
  const env = { FEATURE_NEW_CHECKOUT: "true", FEATURE_RATE: "25", OTHER: "x" };

  it("FEATURE_NEW_CHECKOUT is the flag new-checkout", async () => {
    const provider = createEnvironmentProvider({ env });
    const keys = (await provider.getAll()).map((f) => f.key).sort();
    expect(keys).toEqual(["new-checkout", "rate"]);

    const flags = createFeatureFlags({ provider });
    expect(await flags.isEnabled("new-checkout")).toBe(true);
  });

  it("get() accepts the variable-style spelling as well", async () => {
    const provider = createEnvironmentProvider({ env });
    expect((await provider.get("NEW_CHECKOUT"))?.key).toBe("new-checkout");
    expect((await provider.get("new_checkout"))?.key).toBe("new-checkout");
    expect((await provider.get("new-checkout"))?.defaultValue).toBe(true);
  });

  it("an old-style lookup through createFeatureFlags still resolves", async () => {
    const flags = createFeatureFlags({ provider: createEnvironmentProvider({ env }) });
    expect(await flags.isEnabled("NEW_CHECKOUT")).toBe(true);
  });

  it("overrides the same key from another provider in a composite", async () => {
    const provider = createCompositeProvider([
      createEnvironmentProvider({ env: { FEATURE_NEW_CHECKOUT: "false" } }),
      createMemoryProvider([{ key: "new-checkout", enabled: true, defaultValue: true }]),
    ]);
    const flags = createFeatureFlags({ provider });
    expect(await flags.isEnabled("new-checkout")).toBe(false);
  });

  it("keyFormat: \"preserve\" keeps the previous behaviour", async () => {
    const provider = createEnvironmentProvider({ env, keyFormat: "preserve" });
    expect((await provider.getAll()).map((f) => f.key).sort()).toEqual([
      "NEW_CHECKOUT",
      "RATE",
    ]);
    expect(await provider.get("new-checkout")).toBeUndefined();
  });
});
