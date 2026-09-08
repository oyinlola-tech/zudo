/**
 * @zudojs/cache — Serializer Tests
 *
 * Tests for JsonCacheSerializer, RawCacheSerializer, the type-preserving
 * default, and prototype-pollution hardening on deserialize.
 */

import { describe, it, expect } from "vitest";

import {
  JsonCacheSerializer,
  RawCacheSerializer,
  defaultSerializer,
  rawSerializer,
  stripUnsafeKeys,
} from "../src/serializer.js";

// ─── JsonCacheSerializer ───────────────────────────────────────────────────

describe("JsonCacheSerializer", () => {
  const serializer = new JsonCacheSerializer();

  it("serializes primitives", () => {
    expect(serializer.serialize("hello")).toBe('"hello"');
    expect(serializer.serialize(42)).toBe("42");
    expect(serializer.serialize(true)).toBe("true");
    expect(serializer.serialize(null)).toBe("null");
  });

  it("deserializes primitives", () => {
    expect(serializer.deserialize('"hello"')).toBe("hello");
    expect(serializer.deserialize("42")).toBe(42);
    expect(serializer.deserialize("true")).toBe(true);
    expect(serializer.deserialize("null")).toBe(null);
  });

  it("round-trips objects", () => {
    const obj = { name: "test", count: 42, nested: { a: [1, 2, 3] } };
    const serialized = serializer.serialize(obj);
    const deserialized = serializer.deserialize(serialized);
    expect(deserialized).toEqual(obj);
  });

  it("round-trips arrays", () => {
    const arr = [1, "two", true, null, { three: 3 }];
    const serialized = serializer.serialize(arr);
    const deserialized = serializer.deserialize(serialized);
    expect(deserialized).toEqual(arr);
  });

  it("handles Date objects with type preservation", () => {
    const dateSerializer = new JsonCacheSerializer({
      preserveTypes: true,
    });

    const input = { createdAt: new Date("2024-01-15T12:00:00.000Z") };
    const serialized = dateSerializer.serialize(input);
    const deserialized = dateSerializer.deserialize(serialized) as {
      createdAt: Date;
    };
    expect(deserialized.createdAt).toBeInstanceOf(Date);
    expect(deserialized.createdAt.toISOString()).toBe(
      "2024-01-15T12:00:00.000Z",
    );
  });

  it("handles empty objects and arrays", () => {
    expect(serializer.deserialize(serializer.serialize({}))).toEqual({});
    expect(serializer.deserialize(serializer.serialize([]))).toEqual([]);
  });
});

// ─── RawCacheSerializer ────────────────────────────────────────────────────

describe("RawCacheSerializer", () => {
  const serializer = new RawCacheSerializer();

  it("passes through primitives", () => {
    expect(serializer.serialize("hello")).toBe("hello");
    expect(serializer.serialize(42)).toBe(42);
    expect(serializer.serialize(true)).toBe(true);
    expect(serializer.serialize(null)).toBe(null);
    expect(serializer.serialize(undefined)).toBe(undefined);
  });

  it("passes through objects by reference", () => {
    const obj = { a: 1 };
    expect(serializer.serialize(obj)).toBe(obj);
  });

  it("passes through arrays by reference", () => {
    const arr = [1, 2, 3];
    expect(serializer.serialize(arr)).toBe(arr);
  });

  it("deserialize is identity", () => {
    expect(serializer.deserialize("hello")).toBe("hello");
    expect(serializer.deserialize(42)).toBe(42);
    expect(serializer.deserialize({ a: 1 })).toEqual({ a: 1 });
  });
});

// ─── Regression: type preservation is the default ──────────────────────────

describe("JsonCacheSerializer — default type preservation", () => {
  // Regression: the default singleton used to be lossy, so a cached Date
  // silently came back as a string with no error anywhere.
  it("round-trips Date, Map and Set through the default serializer", () => {
    const input = {
      at: new Date("2024-01-15T12:00:00.000Z"),
      map: new Map([["a", 1]]),
      set: new Set([1, 2]),
    };
    const out = defaultSerializer.deserialize(
      defaultSerializer.serialize(input),
    ) as typeof input;
    expect(out.at).toBeInstanceOf(Date);
    expect(out.at.toISOString()).toBe("2024-01-15T12:00:00.000Z");
    expect(out.map).toBeInstanceOf(Map);
    expect(out.map.get("a")).toBe(1);
    expect(out.set).toBeInstanceOf(Set);
    expect(out.set.has(2)).toBe(true);
  });

  it("can be opted out of", () => {
    const lossy = new JsonCacheSerializer({ preserveTypes: false });
    const out = lossy.deserialize(
      lossy.serialize({ at: new Date("2024-01-15T12:00:00.000Z") }),
    ) as { at: unknown };
    expect(out.at).not.toBeInstanceOf(Date);
  });
});

// ─── Regression: prototype-pollution hardening ─────────────────────────────

describe("JsonCacheSerializer — unsafe keys", () => {
  // A stored payload is not necessarily one this process wrote: a shared
  // Redis, a restored backup, or another writer can put it there.
  it("does not hijack the prototype of a deserialized object (preserveTypes)", () => {
    const serializer = new JsonCacheSerializer({ preserveTypes: true });
    const out = serializer.deserialize(
      '{"a":1,"__proto__":{"isAdmin":true}}',
    ) as Record<string, unknown>;
    expect(out.a).toBe(1);
    expect(out["isAdmin"]).toBeUndefined();
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>)["isAdmin"]).toBeUndefined();
  });

  it("removes __proto__ as an own property (plain JSON)", () => {
    const serializer = new JsonCacheSerializer({ preserveTypes: false });
    const out = serializer.deserialize(
      '{"a":1,"__proto__":{"isAdmin":true}}',
    ) as Record<string, unknown>;
    expect(Object.getOwnPropertyNames(out)).not.toContain("__proto__");
    // A downstream spread must not re-trigger the setter.
    const merged = { ...out } as Record<string, unknown>;
    expect(Object.getPrototypeOf(merged)).toBe(Object.prototype);
    expect(merged["isAdmin"]).toBeUndefined();
  });

  it("strips unsafe keys nested inside arrays and objects", () => {
    const value = JSON.parse(
      '{"list":[{"__proto__":{"x":1},"ok":2}],"deep":{"constructor":"bad","fine":3}}',
    ) as Record<string, unknown>;
    const cleaned = stripUnsafeKeys(value) as {
      list: { ok: number }[];
      deep: Record<string, unknown>;
    };
    expect(cleaned.list[0]!.ok).toBe(2);
    expect(Object.getOwnPropertyNames(cleaned.list[0]!)).not.toContain(
      "__proto__",
    );
    expect(Object.getOwnPropertyNames(cleaned.deep)).not.toContain(
      "constructor",
    );
    expect(cleaned.deep["fine"]).toBe(3);
  });

  it("leaves reconstructed Date/Map/Set instances alone", () => {
    const value = { at: new Date(0), map: new Map([["k", 1]]) };
    const cleaned = stripUnsafeKeys(value);
    expect(cleaned.at).toBeInstanceOf(Date);
    expect(cleaned.map).toBeInstanceOf(Map);
  });
});

// ─── Singleton Instances ───────────────────────────────────────────────────

describe("singleton instances", () => {
  it("defaultSerializer is JsonCacheSerializer", () => {
    expect(defaultSerializer).toBeInstanceOf(JsonCacheSerializer);
  });

  it("rawSerializer is RawCacheSerializer", () => {
    expect(rawSerializer).toBeInstanceOf(RawCacheSerializer);
  });
});
