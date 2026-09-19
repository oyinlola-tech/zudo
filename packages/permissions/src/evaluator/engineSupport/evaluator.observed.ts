/**
 * Audit-event wrapper shared by every path that makes a decision.
 *
 * @module evaluator/evaluator.observed
 */

import type {
  PermissionActor,
  PermissionDecision,
} from "../../permissionTypes/index.js";
import type { PermissionEventEmitter } from "../../observability/observability.core.js";

/** Best-effort resource type for an audit event. */
export function resourceTypeOf(resource: unknown): string | undefined {
  if (typeof resource !== "object" || resource === null) return undefined;
  const record = resource as {
    type?: unknown;
    constructor?: { name?: string };
  };
  if (typeof record.type === "string") return record.type;
  const name = record.constructor?.name;
  return name && name !== "Object" ? name : undefined;
}

/**
 * Run one authorization and emit an audit event whichever way it ends —
 * including when it throws. An authorization trail that records only the
 * successful paths is not a trail, and one that skips `explain()` misses
 * decisions that are real: they run the same evaluation and write the same
 * cache entries that later checks are served from.
 */
export async function observed<T>(
  emitter: PermissionEventEmitter | undefined,
  actor: PermissionActor,
  permission: string,
  resource: unknown,
  run: () => Promise<T>,
  decisionOf: (result: T) => PermissionDecision,
): Promise<T> {
  const start = performance.now();
  let decision: PermissionDecision | undefined;
  let failure: unknown;

  try {
    const result = await run();
    decision = decisionOf(result);
    return result;
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    emitter?.emit({
      actorId: actor.id,
      permission,
      resourceType: resourceTypeOf(resource),
      allowed: decision?.allowed ?? false,
      reason:
        decision?.reason ??
        (failure instanceof Error ? `error:${failure.name}` : undefined),
      durationMs: performance.now() - start,
      errored: failure !== undefined,
    });
  }
}
