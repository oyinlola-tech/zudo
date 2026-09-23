/**
 * Deep detection of prototype-polluting keys in decoded, untrusted data
 * (objects and arrays). `containsPrototypePollution` covers strings.
 */

import { SCHEMA_FORBIDDEN_KEYS } from "@zudojs/constants";

function isTraversable(value: unknown): value is object {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  if (Array.isArray(value)) {
    return true;
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

/**
 * Returns the first `__proto__`, `constructor` or `prototype` key found
 * anywhere in `value`, or `undefined` when there is none.
 *
 * `JSON.parse` keeps such a key as an ordinary own property, so it reaches
 * handlers intact; the moment one is copied with `Object.assign`, a
 * `for…in` merge or a bracket assignment, it replaces the target's
 * prototype. Transports refuse a frame that carries one rather than
 * silently dropping it.
 *
 * Walks plain objects and arrays only, iteratively (no recursion limit)
 * and cycle-safe, so it is safe on any decoded or in-process value.
 */
export function findUnsafeKey(value: unknown): string | undefined {
  if (!isTraversable(value)) {
    return undefined;
  }

  const seen = new WeakSet<object>();
  const pending: object[] = [value];

  while (pending.length > 0) {
    const node = pending.pop()!;
    if (seen.has(node)) {
      continue;
    }
    seen.add(node);

    if (Array.isArray(node)) {
      for (const child of node as readonly unknown[]) {
        if (isTraversable(child)) {
          pending.push(child);
        }
      }
      continue;
    }

    for (const key of Object.keys(node)) {
      if (SCHEMA_FORBIDDEN_KEYS.has(key)) {
        return key;
      }
      const child = (node as Record<string, unknown>)[key];
      if (isTraversable(child)) {
        pending.push(child);
      }
    }
  }

  return undefined;
}
