/**
 * Actor digest for the decision cache key.
 *
 * A decision depends on everything the actor carries, not only its id:
 * `roles`, `permissions` and `type` travel on the actor object for each
 * request (a tenant-scoped token, `auth.checkAccess`), and a condition may
 * read any other field on it. Keying on the id alone let an admin decision
 * made in one tenant answer for the same user as a viewer in another, and a
 * demoted token keep its old grants until the entry expired.
 *
 * @module cache/cache.actorDigest
 */

import type { PermissionActor } from "../permissionTypes/index.js";

/** Longest digest worth keying on; a longer one is not cached at all. */
export const MAX_ACTOR_DIGEST_LENGTH = 4096;

/** Deepest nesting the digest will describe. */
const MAX_DEPTH = 6;

/** Marks a value the digest cannot describe faithfully. */
const UNDESCRIBABLE = Symbol("undescribable");

type Canonical = string | typeof UNDESCRIBABLE;

function isPlainRecord(value: object): boolean {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function canonical(value: unknown, depth: number): Canonical {
  if (depth > MAX_DEPTH) return UNDESCRIBABLE;
  if (value === null) return "null";

  switch (typeof value) {
    case "string":
    case "boolean":
      return JSON.stringify(value);
    case "number":
      return Number.isFinite(value) ? JSON.stringify(value) : UNDESCRIBABLE;
    case "object":
      break;
    default:
      return UNDESCRIBABLE;
  }

  const object = value as object;
  if (object instanceof Date) {
    const time = object.getTime();
    return Number.isNaN(time) ? UNDESCRIBABLE : `D${JSON.stringify(time)}`;
  }

  if (Array.isArray(object)) {
    const parts: string[] = [];
    for (const entry of object) {
      const part = canonical(entry, depth + 1);
      if (part === UNDESCRIBABLE) return UNDESCRIBABLE;
      parts.push(part);
    }
    return `[${parts.join(",")}]`;
  }

  if (!isPlainRecord(object)) return UNDESCRIBABLE;
  return canonicalRecord(object as Record<string, unknown>, depth, []);
}

function canonicalRecord(
  record: Record<string, unknown>,
  depth: number,
  skip: readonly string[],
): Canonical {
  const parts: string[] = [];
  for (const key of Object.keys(record).sort()) {
    if (skip.includes(key)) continue;
    const entry = record[key];
    if (entry === undefined) continue;
    const part = canonical(entry, depth + 1);
    if (part === UNDESCRIBABLE) return UNDESCRIBABLE;
    parts.push(`${JSON.stringify(key)}:${part}`);
  }
  return `{${parts.join(",")}}`;
}

/**
 * A stable description of everything an actor carries besides its id.
 *
 * Returns `undefined` when the actor holds something the digest cannot
 * describe faithfully — a function, a class instance, a `Map`, nesting past
 * six levels, or a digest longer than {@link MAX_ACTOR_DIGEST_LENGTH}. The
 * engine does not cache such a decision rather than key it on a partial
 * description.
 */
export function actorCacheDigest(actor: PermissionActor): string | undefined {
  if (typeof actor !== "object" || actor === null) return undefined;
  const digest = canonicalRecord(
    actor as unknown as Record<string, unknown>,
    0,
    ["id"],
  );
  if (digest === UNDESCRIBABLE) return undefined;
  return digest.length > MAX_ACTOR_DIGEST_LENGTH ? undefined : digest;
}
