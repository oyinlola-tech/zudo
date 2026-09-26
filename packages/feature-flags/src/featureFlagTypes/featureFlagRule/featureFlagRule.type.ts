/**
 * Feature flag rule types.
 *
 * Rules determine how a flag evaluates against a given context.
 *
 * @module featureFlagTypes/featureFlagRule
 */

import type { FeatureFlagValue } from "./featureFlagValue.type.js";

/** Operators for attribute-based targeting. */
export type FeatureFlagOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "starts_with"
  | "ends_with"
  | "in"
  | "not_in"
  | "greater_than"
  | "greater_than_or_equal"
  | "less_than"
  | "less_than_or_equal"
  | "exists"
  | "matches";

/** A static rule — always returns its value. */
export interface FeatureFlagStaticRule {
  readonly type: "static";
  readonly value: FeatureFlagValue;
}

/** Target specific users by ID. */
export interface FeatureFlagUserRule {
  readonly type: "user";
  readonly users: readonly string[];
  readonly value: FeatureFlagValue;
}

/** Target specific tenants by ID. */
export interface FeatureFlagTenantRule {
  readonly type: "tenant";
  readonly tenants: readonly string[];
  readonly value: FeatureFlagValue;
}

/**
 * Target by attribute matching.
 *
 * `value` is the comparison operand, not what the rule serves. What a match
 * serves is `result`, which defaults to `true` — so on a non-boolean flag an
 * attribute rule must set `result`, and one that does not is skipped rather
 * than serving a boolean from a string, number or object flag.
 */
export interface FeatureFlagAttributeRule {
  readonly type: "attribute";
  readonly attribute: string;
  readonly operator: FeatureFlagOperator;
  /** The operand the attribute is compared against. */
  readonly value: unknown;
  /** The value served when the rule matches. Default: `true`. */
  readonly result?: FeatureFlagValue;
}

/**
 * Which context field a rollout hashes on.
 *
 * Without `bucketBy`, the subject is `userId`, then `tenantId`, then
 * `sessionId`, then `"anonymous"` — so for a context carrying both a user
 * and a tenant, members of one tenant land in different buckets. Set
 * `bucketBy: "tenantId"` to roll a flag out per organisation. When the
 * named field is absent from the context the rule does not match, rather
 * than silently bucketing on something else.
 */
export type FeatureFlagBucketBy = "userId" | "tenantId" | "sessionId";

/** Percentage-based rollout — deterministic per subject. */
export interface FeatureFlagPercentageRule {
  readonly type: "percentage";
  readonly percentage: number;
  readonly value: FeatureFlagValue;
  /** Context field to bucket on; see {@link FeatureFlagBucketBy}. */
  readonly bucketBy?: FeatureFlagBucketBy;
}

/** Time-windowed rule — enabled only within a date range. */
export interface FeatureFlagScheduleRule {
  readonly type: "schedule";
  readonly startAt: string;
  readonly endAt: string;
  readonly value: FeatureFlagValue;
}

/** Variant assignment rule — assigns a variant key based on weight. */
export interface FeatureFlagVariantRule {
  readonly type: "variant";
  readonly variants: readonly FeatureFlagVariant[];
  /** Context field to bucket on; see {@link FeatureFlagBucketBy}. */
  readonly bucketBy?: FeatureFlagBucketBy;
}

/** A variant with a weight for percentage-based assignment. */
export interface FeatureFlagVariant {
  readonly key: string;
  readonly weight: number;
}

/** Union of all feature flag rule types. */
export type FeatureFlagRule =
  | FeatureFlagStaticRule
  | FeatureFlagUserRule
  | FeatureFlagTenantRule
  | FeatureFlagAttributeRule
  | FeatureFlagPercentageRule
  | FeatureFlagScheduleRule
  | FeatureFlagVariantRule;
