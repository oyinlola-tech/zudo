/**
 * Decision cache key for one evaluation.
 *
 * @module evaluator/evaluator.cacheKey
 */

import type {
  AuthorizationOptions,
  PermissionActor,
} from "../../permissionTypes/index.js";
import { permissionCacheKey } from "../../cache/cache.core.js";
import { actorCacheDigest } from "../../cache/cache.actorDigest.js";
import type { EvaluatorOptions } from "../evaluator.pipeline.js";

/** True when the caller supplied request metadata the cache key cannot carry. */
function hasMetadata(metadata: AuthorizationOptions["metadata"]): boolean {
  if (!metadata) return false;
  if (metadata instanceof Map) return metadata.size > 0;
  return Object.keys(metadata).length > 0;
}

/** Best-effort resource identity for the cache key. */
function resourceIdOf(resource: unknown): string | undefined {
  if (typeof resource !== "object" || resource === null) return undefined;
  const id = (resource as { id?: unknown }).id;
  if (typeof id === "string") return id;
  if (typeof id === "number") return String(id);
  return undefined;
}

/**
 * The cache key for a decision, or `undefined` when it must not be cached.
 *
 * Only a decision the key can describe completely may be cached:
 *
 * - A resource with no derivable id would collapse the key to
 *   `actor|permission`, so an allow for `{ ownerId: "ada" }` would answer for
 *   `{ ownerId: "bob" }`.
 * - Request metadata is not in the key, and `tenantIsolation()` reads the
 *   tenant from it.
 * - The actor's roles, permissions, type and any other field it carries are
 *   in the key as a digest; an actor the digest cannot describe is not cached.
 * - The engine's configuration generation is in the key, so a role removed
 *   from a live registry cannot be served from an entry written before.
 * - An external resolver reads state the key knows nothing about, so a
 *   resolver-backed engine is uncacheable unless it supplies
 *   `resolverCacheKey`. So is one whose implication source cannot announce a
 *   change.
 */
export function decisionCacheKey(
  actor: PermissionActor,
  permissionStr: string,
  resource: unknown,
  options: EvaluatorOptions,
  authOptions?: AuthorizationOptions,
): string | undefined {
  if (!options.cache || authOptions?.skipCache === true) return undefined;

  const resourceId = authOptions?.resourceId ?? resourceIdOf(resource);
  if (resource !== undefined && resourceId === undefined) return undefined;
  if (hasMetadata(authOptions?.metadata)) return undefined;

  const digest = actorCacheDigest(actor);
  if (digest === undefined) return undefined;

  // An engine that cannot describe its own configuration for this actor
  // returns `undefined` here — an external resolver with no
  // `resolverCacheKey`, or an implication source that cannot announce a
  // change. Both would otherwise keep answering from a revoked grant.
  let generation = "";
  if (options.cacheScope !== undefined) {
    const scope = options.cacheScope(actor);
    if (scope === undefined) return undefined;
    generation = scope;
  }

  return permissionCacheKey(
    actor.id,
    permissionStr,
    resourceId,
    `${generation}${digest}`,
  );
}
