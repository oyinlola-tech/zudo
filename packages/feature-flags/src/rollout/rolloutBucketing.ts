/**
 * Deterministic bucketing for percentage rollouts.
 *
 * Maps a (flag key, subject) pair to a bucket in [0, buckets).
 * Supports sub-percent precision with 10,000 buckets.
 *
 * @module rollout/rolloutBucketing
 */

import type { FeatureFlagContext } from "../featureFlagTypes/featureFlagContext.js";
import type { FeatureFlagBucketBy } from "../featureFlagTypes/featureFlagRule/featureFlagRule.type.js";
import { hashString } from "./rolloutHashing.js";

/** Default number of buckets — 10,000 allows 0.01% precision. */
const DEFAULT_BUCKETS = 10_000;

/**
 * Compute a deterministic bucket for a flag rollout.
 *
 * @param key - The feature flag key.
 * @param subject - The subject identifier (e.g. userId, tenantId).
 * @param buckets - Total number of buckets (default 10,000).
 * @returns A bucket number in [0, buckets).
 */
export function getBucket(
  key: string,
  subject: string,
  buckets: number = DEFAULT_BUCKETS,
): number {
  const hash = hashString(`${key}:${subject}`);
  return hash % buckets;
}

/**
 * Check whether a subject falls within a percentage rollout.
 *
 * @param key - The feature flag key.
 * @param subject - The subject identifier.
 * @param percentage - Percentage from 0 to 100 (supports decimals like 25.5).
 * @returns Whether the subject is in the rollout.
 */
export function isInRollout(
  key: string,
  subject: string,
  percentage: number,
): boolean {
  if (percentage <= 0) return false;
  if (percentage >= 100) return true;

  const buckets = 10_000;
  const threshold = Math.round((percentage / 100) * buckets);
  const bucket = getBucket(key, subject, buckets);
  return bucket < threshold;
}

/**
 * Pick the identifier a percentage or variant rule buckets on.
 *
 * With `bucketBy` set, only that field counts: `undefined` is returned when
 * the context lacks it, and the caller treats the rule as not matched.
 * Without it, the default chain applies — `userId`, then `tenantId`, then
 * `sessionId`, then `"anonymous"`.
 *
 * @param context - The evaluation context.
 * @param bucketBy - The rule's `bucketBy`, if any.
 * @returns The subject to hash, or `undefined` when a pinned field is absent.
 */
export function resolveRolloutSubject(
  context: FeatureFlagContext,
  bucketBy?: FeatureFlagBucketBy,
): string | undefined {
  if (bucketBy !== undefined) {
    const pinned = context[bucketBy];
    return typeof pinned === "string" && pinned.length > 0 ? pinned : undefined;
  }
  return context.userId ?? context.tenantId ?? context.sessionId ?? "anonymous";
}
