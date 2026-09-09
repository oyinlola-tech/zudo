import { describe, it, expect } from "vitest";
import {
  resolvePath,
  matchAttribute,
} from "../src/evaluator/evaluatorAttribute.js";
import { evaluateRule } from "../src/evaluator/evaluatorRule.core.js";
import { evaluateFlag } from "../src/evaluator/evaluator.core.js";
import type { FeatureFlag } from "../src/featureFlagTypes/featureFlag.interface.js";

describe("resolvePath", () => {
  it("resolves top-level keys", () => {
    expect(resolvePath({ a: 1 }, "a")).toBe(1);
  });

  it("resolves nested keys", () => {
    expect(resolvePath({ user: { country: "NG" } }, "user.country")).toBe("NG");
  });

  it("returns undefined for missing paths", () => {
    expect(resolvePath({ a: 1 }, "b")).toBeUndefined();
  });

  it("returns undefined for deep missing paths", () => {
    expect(resolvePath({ a: { b: 1 } }, "a.c.d")).toBeUndefined();
  });
});

describe("matchAttribute", () => {
  it("equals matches", () => {
    expect(matchAttribute("pro", "equals", "pro")).toBe(true);
  });

  it("equals does not match", () => {
    expect(matchAttribute("free", "equals", "pro")).toBe(false);
  });

  it("not_equals matches", () => {
    expect(matchAttribute("free", "not_equals", "pro")).toBe(true);
  });

  it("in matches", () => {
    expect(matchAttribute("pro", "in", ["pro", "enterprise"])).toBe(true);
  });

  it("in does not match", () => {
    expect(matchAttribute("free", "in", ["pro", "enterprise"])).toBe(false);
  });

  it("not_in matches", () => {
    expect(matchAttribute("free", "not_in", ["pro", "enterprise"])).toBe(true);
  });

  it("greater_than matches", () => {
    expect(matchAttribute(10, "greater_than", 5)).toBe(true);
  });

  it("less_than matches", () => {
    expect(matchAttribute(3, "less_than", 5)).toBe(true);
  });

  it("contains matches", () => {
    expect(matchAttribute("hello world", "contains", "world")).toBe(true);
  });

  it("starts_with matches", () => {
    expect(matchAttribute("hello", "starts_with", "hel")).toBe(true);
  });

  it("ends_with matches", () => {
    expect(matchAttribute("hello", "ends_with", "llo")).toBe(true);
  });

  it("exists matches non-null", () => {
    expect(matchAttribute("value", "exists", true)).toBe(true);
  });

  it("exists does not match null", () => {
    expect(matchAttribute(null, "exists", true)).toBe(false);
  });

  it("matches regex", () => {
    expect(matchAttribute("user_123", "matches", "^user_\\d+$")).toBe(true);
  });
});

describe("evaluateRule", () => {
  it("static rule always matches", () => {
    const result = evaluateRule({ type: "static", value: true }, {}, "flag");
    expect(result.matched).toBe(true);
    expect(result.value).toBe(true);
  });

  it("user rule matches target user", () => {
    const result = evaluateRule(
      { type: "user", users: ["u1", "u2"], value: true },
      { userId: "u1" },
      "flag",
    );
    expect(result.matched).toBe(true);
  });

  it("user rule does not match other user", () => {
    const result = evaluateRule(
      { type: "user", users: ["u1"], value: true },
      { userId: "u3" },
      "flag",
    );
    expect(result.matched).toBe(false);
  });

  it("tenant rule matches target tenant", () => {
    const result = evaluateRule(
      { type: "tenant", tenants: ["t1"], value: true },
      { tenantId: "t1" },
      "flag",
    );
    expect(result.matched).toBe(true);
  });

  it("attribute rule matches", () => {
    const result = evaluateRule(
      {
        type: "attribute",
        attribute: "plan",
        operator: "equals",
        value: "pro",
      },
      { attributes: { plan: "pro" } },
      "flag",
    );
    expect(result.matched).toBe(true);
  });

  it("percentage rule with 100% always matches", () => {
    const result = evaluateRule(
      { type: "percentage", percentage: 100, value: true },
      { userId: "anyone" },
      "flag",
    );
    expect(result.matched).toBe(true);
  });

  it("percentage rule with 0% never matches", () => {
    const result = evaluateRule(
      { type: "percentage", percentage: 0, value: true },
      { userId: "anyone" },
      "flag",
    );
    expect(result.matched).toBe(false);
  });

  it("schedule rule matches within window", () => {
    const now = new Date();
    const result = evaluateRule(
      {
        type: "schedule",
        startAt: new Date(now.getTime() - 1000).toISOString(),
        endAt: new Date(now.getTime() + 1000).toISOString(),
        value: true,
      },
      {},
      "flag",
    );
    expect(result.matched).toBe(true);
  });

  it("schedule rule does not match outside window", () => {
    const now = new Date();
    const result = evaluateRule(
      {
        type: "schedule",
        startAt: new Date(now.getTime() + 10000).toISOString(),
        endAt: new Date(now.getTime() + 20000).toISOString(),
        value: true,
      },
      {},
      "flag",
    );
    expect(result.matched).toBe(false);
  });
});

describe("evaluateFlag", () => {
  it("returns default for disabled flag", () => {
    const flag: FeatureFlag = { key: "f", enabled: false, defaultValue: false };
    const result = evaluateFlag(flag);
    expect(result.value).toBe(false);
    expect(result.reason).toBe("disabled");
  });

  it("returns default when no rules match", () => {
    const flag: FeatureFlag = {
      key: "f",
      enabled: true,
      defaultValue: "control",
      rules: [{ type: "user", users: ["u1"], value: "treatment" }],
    };
    const result = evaluateFlag(flag, { userId: "u2" });
    expect(result.value).toBe("control");
    expect(result.defaulted).toBe(true);
  });

  it("returns matched rule value", () => {
    const flag: FeatureFlag = {
      key: "f",
      enabled: true,
      defaultValue: false,
      rules: [{ type: "user", users: ["u1"], value: true }],
    };
    const result = evaluateFlag(flag, { userId: "u1" });
    expect(result.value).toBe(true);
    expect(result.defaulted).toBe(false);
    expect(result.matchedRule).toBe(0);
  });

  it("returns first matching rule", () => {
    const flag: FeatureFlag = {
      key: "f",
      enabled: true,
      defaultValue: "default",
      rules: [
        { type: "user", users: ["u1"], value: "first" },
        { type: "user", users: ["u1"], value: "second" },
      ],
    };
    const result = evaluateFlag(flag, { userId: "u1" });
    expect(result.value).toBe("first");
    expect(result.matchedRule).toBe(0);
  });

  it("returns default for archived flag", () => {
    const flag: FeatureFlag = {
      key: "f",
      enabled: true,
      defaultValue: false,
      state: "archived",
    };
    const result = evaluateFlag(flag);
    expect(result.reason).toBe("expired");
  });

  it("returns default for draft flag", () => {
    const flag: FeatureFlag = {
      key: "f",
      enabled: true,
      defaultValue: false,
      state: "draft",
    };
    const result = evaluateFlag(flag);
    expect(result.reason).toBe("disabled");
  });

  it("returns dependency_disabled when dependencies are unresolved", () => {
    // evaluateFlag has no registry, so it cannot resolve a dependency itself
    // and must assume the worst. The test used to be named as if it proved
    // "deps not met", which it never did — it passed for every flag with
    // dependencies, met or not.
    const flag: FeatureFlag = {
      key: "f",
      enabled: true,
      defaultValue: false,
      dependencies: ["other-flag"],
    };
    expect(evaluateFlag(flag).reason).toBe("dependency_disabled");
    expect(
      evaluateFlag(flag, {}, { dependenciesSatisfied: false }).reason,
    ).toBe("dependency_disabled");
  });

  it("evaluates a flag whose dependencies the caller resolved", () => {
    const flag: FeatureFlag = {
      key: "f",
      enabled: true,
      defaultValue: false,
      dependencies: ["other-flag"],
      rules: [{ type: "static", value: true }],
    };
    const result = evaluateFlag(flag, {}, { dependenciesSatisfied: true });
    expect(result.reason).toBe("static");
    expect(result.value).toBe(true);
  });
});
