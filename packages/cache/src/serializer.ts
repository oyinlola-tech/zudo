/**
 * @zudojs/cache — Serializer
 *
 * Provides serializer implementations for converting cache values
 * to and from storable representations. Delegates to @zudojs/serialization
 * for the actual JSON serialization with type preservation.
 */

import type { CacheSerializer } from "./types.js";
import { JSONSerializer } from "@zudojs/serialization";

/* -------------------------------------------------------------------------- */
/* Prototype-pollution hardening                                              */
/* -------------------------------------------------------------------------- */

const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Strips prototype-polluting own keys from a freshly deserialized value.
 *
 * This is defence in depth at the trust boundary: a cached payload can come
 * from a shared backing store, a restored backup, or another writer, so the
 * bytes are not necessarily ones this process serialized. `@zudojs/errors`'
 * sibling `@zudojs/serialization` accepts an `allowUnsafeKeys` option but
 * the published build does not implement it, and `JSON.parse` leaves
 * `__proto__` as a genuine own property — which re-triggers the setter on
 * any later spread or `Object.assign`. Both routes are closed here.
 */
export function stripUnsafeKeys<T>(value: T): T {
  const seen = new Set<object>();
  const walk = (node: unknown): void => {
    if (node === null || typeof node !== "object") return;
    const obj = node as object;
    if (seen.has(obj)) return;
    seen.add(obj);
    if (Array.isArray(obj)) {
      for (const item of obj) walk(item);
      return;
    }
    if (obj instanceof Map) {
      for (const entry of obj.values()) walk(entry);
      return;
    }
    if (obj instanceof Set) {
      for (const entry of obj) walk(entry);
      return;
    }
    for (const key of Object.getOwnPropertyNames(obj)) {
      if (UNSAFE_KEYS.has(key)) {
        Reflect.deleteProperty(obj, key);
        continue;
      }
      walk((obj as Record<string, unknown>)[key]);
    }
    // A hijacked prototype survives key deletion, so reset it too.
    if (Object.getPrototypeOf(obj) !== Object.prototype && isPlainish(obj)) {
      Object.setPrototypeOf(obj, Object.prototype);
    }
  };
  walk(value);
  return value;
}

/**
 * True when an object is a plain data container whose prototype should be
 * `Object.prototype` — i.e. not a Date/Map/Set/typed array/class instance we
 * deliberately reconstructed.
 */
function isPlainish(obj: object): boolean {
  if (
    obj instanceof Date ||
    obj instanceof Map ||
    obj instanceof Set ||
    obj instanceof RegExp ||
    obj instanceof Error ||
    ArrayBuffer.isView(obj) ||
    obj instanceof ArrayBuffer
  ) {
    return false;
  }
  const proto = Object.getPrototypeOf(obj) as object | null;
  // Only a null prototype or a foreign literal object indicates tampering;
  // anything with a real constructor is left alone.
  return proto === null || proto.constructor === Object;
}

/* -------------------------------------------------------------------------- */
/* JSON Serializer                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Serializes values to JSON strings and deserializes them back.
 *
 * Preserves special types (Date, BigInt, Map, Set, Uint8Array) by default —
 * round-trip fidelity is the point of a cache, and a silently lossy default
 * turns `set(k, { at: new Date() })` into a string on the way back out. Pass
 * `{ preserveTypes: false }` for plain JSON semantics.
 *
 * Deserialization is hardened against prototype-polluting keys.
 */
export class JsonCacheSerializer implements CacheSerializer<unknown, string> {
  private readonly inner: JSONSerializer;
  private readonly preserveTypes: boolean;

  constructor(options?: { readonly preserveTypes?: boolean }) {
    this.preserveTypes = options?.preserveTypes ?? true;
    this.inner = new JSONSerializer();
  }

  serialize(value: unknown): string {
    return this.inner.serialize(value, {
      preserveTypes: this.preserveTypes,
    });
  }

  deserialize(value: string): unknown {
    const parsed = this.inner.deserialize(value, {
      preserveTypes: this.preserveTypes,
      // Stated at the call site even though the published sibling build
      // ignores them; `stripUnsafeKeys` enforces the intent regardless.
      strict: true,
      allowUnsafeKeys: false,
    });
    return stripUnsafeKeys(parsed);
  }
}

/* -------------------------------------------------------------------------- */
/* Raw Serializer                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Pass-through serializer for values that are already in
 * their storable form (e.g., strings, numbers).
 */
export class RawCacheSerializer implements CacheSerializer<unknown, unknown> {
  serialize(value: unknown): unknown {
    return value;
  }

  deserialize(value: unknown): unknown {
    return value;
  }
}

/* -------------------------------------------------------------------------- */
/* Default Singleton                                                          */
/* -------------------------------------------------------------------------- */

/** Default JSON serializer instance (type-preserving). */
export const defaultSerializer = new JsonCacheSerializer();

/** Default raw (pass-through) serializer instance. */
export const rawSerializer = new RawCacheSerializer();
