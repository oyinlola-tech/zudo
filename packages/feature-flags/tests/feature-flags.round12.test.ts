/**
 * Round 12 regressions for @zudojs/feature-flags (academy finding #119).
 */

import { describe, it, expect } from "vitest";
import { evaluateRule, isInRollout, getBucket } from "../src/index.js";
import type {
  FeatureFlagPercentageRule,
  FeatureFlagVariantRule,
} from "../src/index.js";

const FLAG = "checkout.v2";

describe("#119 bucketBy pins the rollout subject", () => {
  it("bucketBy: tenantId gives every member of a tenant the same answer", () => {
    const rule: FeatureFlagPercentageRule = {
      type: "percentage",
      percentage: 10,
      value: true,
      bucketBy: "tenantId",
    };
    let disagreements = 0;
    for (let index = 0; index < 1_000; index += 1) {
      const tenantId = `org-${index}`;
      const tenantOnly = evaluateRule(rule, { tenantId }, FLAG).matched;
      const withUser = evaluateRule(
        rule,
        { tenantId, userId: `user-${index}` },
        FLAG,
      ).matched;
      if (tenantOnly !== withUser) disagreements += 1;
      expect(tenantOnly).toBe(isInRollout(FLAG, tenantId, 10));
    }
    expect(disagreements).toBe(0);
  });

  it("without bucketBy the default chain (userId first) still applies", () => {
    const rule: FeatureFlagPercentageRule = {
      type: "percentage",
      percentage: 50,
      value: true,
    };
    const context = { tenantId: "adas-bakery", userId: "ada" };
    expect(evaluateRule(rule, context, FLAG).matched).toBe(
      isInRollout(FLAG, "ada", 50),
    );
  });

  it("a rule whose bucketBy field is missing from the context does not match", () => {
    const rule: FeatureFlagPercentageRule = {
      type: "percentage",
      percentage: 100,
      value: true,
      bucketBy: "sessionId",
    };
    expect(evaluateRule(rule, { userId: "ada" }, FLAG).matched).toBe(false);
    expect(evaluateRule(rule, { sessionId: "s1" }, FLAG).matched).toBe(true);
  });

  it("variant rules honour bucketBy too", () => {
    const rule: FeatureFlagVariantRule = {
      type: "variant",
      bucketBy: "tenantId",
      variants: [
        { key: "a", weight: 50 },
        { key: "b", weight: 50 },
      ],
    };
    const tenantId = "kola-motors";
    const expected = getBucket(FLAG, tenantId, 10_000) < 5_000 ? "a" : "b";
    for (const userId of ["u1", "u2", "u3"]) {
      expect(evaluateRule(rule, { tenantId, userId }, FLAG).variant).toBe(
        expected,
      );
    }
  });
});
