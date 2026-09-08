/**
 * @zudojs/serialization — Tests.
 *
 * Comprehensive test suite covering JSON serializer, type transformers,
 * transformer registry, serializer registry, envelope, and validation.
 */

import { describe, it, expect } from "vitest";
import {
  JSONSerializer,
  TransformerRegistry,
  DateTransformer,
  BigIntTransformer,
  MapTransformer,
  SetTransformer,
  BufferTransformer,
  ErrorTransformer,
  SerializerRegistry,
  createSerializer,
  createDefaultRegistry,
  createEnvelope,
  unwrapEnvelope,
  serializeToEnvelope,
  deserializeFromEnvelope,
} from "../src/index.js";

// ─── JSONSerializer — Fast Path ──────────────────────────────

describe("JSONSerializer — fast path", () => {
  const serializer = new JSONSerializer();

  it("serializes and deserializes plain objects", () => {
    const data = { name: "Alice", age: 30 };
    const json = serializer.serialize(data);
    expect(json).toBe('{"name":"Alice","age":30}');
    expect(serializer.deserialize(json)).toEqual(data);
  });

  it("serializes arrays", () => {
    const data = [1, 2, 3, "hello"];
    const json = serializer.serialize(data);
    expect(serializer.deserialize(json)).toEqual(data);
  });

  it("serializes null and undefined", () => {
    expect(serializer.serialize(null)).toBe("null");
    expect(serializer.deserialize("null")).toBeNull();
    // undefined is omitted by JSON.stringify
    const json = serializer.serialize({ a: undefined });
    expect(json).toBe("{}");
  });

  it("serializes nested objects", () => {
    const data = { a: { b: { c: [1, 2] } } };
    const json = serializer.serialize(data);
    expect(serializer.deserialize(json)).toEqual(data);
  });

  it("serializes with pretty print", () => {
    const json = serializer.serialize({ a: 1 }, { pretty: true });
    expect(json).toContain("\n");
    expect(json).toContain("  ");
  });

  it("returns correct name and contentType", () => {
    expect(serializer.name).toBe("json");
    expect(serializer.contentType).toBe("application/json");
  });
});

// ─── JSONSerializer — Advanced Path (Type Preservation) ─────

describe("JSONSerializer — type preservation", () => {
  const serializer = new JSONSerializer();

  it("preserves Date objects", () => {
    const date = new Date("2026-08-30T10:00:00.000Z");
    const data = { createdAt: date };
    const json = serializer.serialize(data, { preserveTypes: true });
    const result = serializer.deserialize<any>(json, { preserveTypes: true });
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.createdAt.toISOString()).toBe(date.toISOString());
  });

  it("preserves BigInt values", () => {
    const data = { amount: 100n };
    const json = serializer.serialize(data, { preserveTypes: true });
    const result = serializer.deserialize<any>(json, { preserveTypes: true });
    expect(result.amount).toBe(100n);
  });

  it("preserves Map objects", () => {
    const map = new Map([
      ["name", "Alice"],
      ["age", "30"],
    ]);
    const data = { metadata: map };
    const json = serializer.serialize(data, { preserveTypes: true });
    const result = serializer.deserialize<any>(json, { preserveTypes: true });
    expect(result.metadata).toBeInstanceOf(Map);
    expect(result.metadata.get("name")).toBe("Alice");
    expect(result.metadata.get("age")).toBe("30");
  });

  it("preserves Set objects", () => {
    const set = new Set(["a", "b", "c"]);
    const data = { tags: set };
    const json = serializer.serialize(data, { preserveTypes: true });
    const result = serializer.deserialize<any>(json, { preserveTypes: true });
    expect(result.tags).toBeInstanceOf(Set);
    expect(result.tags.has("a")).toBe(true);
    expect(result.tags.has("b")).toBe(true);
    expect(result.tags.has("c")).toBe(true);
    expect(result.tags.size).toBe(3);
  });

  it("preserves Uint8Array", () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const data = { buffer: bytes };
    const json = serializer.serialize(data, { preserveTypes: true });
    const result = serializer.deserialize<any>(json, { preserveTypes: true });
    expect(result.buffer).toBeInstanceOf(Uint8Array);
    expect([...result.buffer]).toEqual([1, 2, 3, 4]);
  });

  it("preserves Error objects", () => {
    const error = new Error("test error");
    (error as unknown as Record<string, unknown>).code = "TEST_ERROR";
    const data = { error };
    const json = serializer.serialize(data, { preserveTypes: true });
    const result = serializer.deserialize<any>(json, { preserveTypes: true });
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error.message).toBe("test error");
    expect(result.error.name).toBe("Error");
  });

  it("preserves nested complex types", () => {
    const data = {
      date: new Date("2026-01-01"),
      amount: 999n,
      tags: new Set(["x"]),
      metadata: new Map([["key", "val"]]),
    };
    const json = serializer.serialize(data, { preserveTypes: true });
    const result = serializer.deserialize<any>(json, { preserveTypes: true });
    expect(result.date).toBeInstanceOf(Date);
    expect(result.amount).toBe(999n);
    expect(result.tags).toBeInstanceOf(Set);
    expect(result.metadata).toBeInstanceOf(Map);
  });
});

// ─── JSONSerializer — Validation ─────────────────────────────

describe("JSONSerializer — validation", () => {
  const serializer = new JSONSerializer();

  it("detects circular references in preserveTypes mode", () => {
    const obj: Record<string, unknown> = { name: "self" };
    obj.self = obj;
    expect(() => serializer.serialize(obj, { preserveTypes: true })).toThrow();
  });

  it("enforces max depth limit in preserveTypes mode", () => {
    const deep: Record<string, unknown> = { a: 1 };
    let current = deep;
    for (let i = 0; i < 10; i++) {
      const next: Record<string, unknown> = { v: i };
      current.a = next;
      current = next;
    }
    expect(() =>
      serializer.serialize(deep, { preserveTypes: true, maxDepth: 3 }),
    ).toThrow();
  });

  it("rejects invalid JSON in strict mode", () => {
    expect(() =>
      serializer.deserialize("not json", { strict: true }),
    ).toThrow();
  });

  it("enforces max size limit", () => {
    const big = "x".repeat(20 * 1024 * 1024);
    expect(() => serializer.serialize(big, { maxSize: 1024 })).toThrow();
  });
});

// ─── TransformerRegistry ─────────────────────────────────────

describe("TransformerRegistry", () => {
  it("registers and retrieves transformers", () => {
    const registry = new TransformerRegistry();
    registry.register(DateTransformer);
    expect(registry.has("Date")).toBe(true);
    expect(registry.get("Date")).toBe(DateTransformer);
    expect(registry.size).toBe(1);
  });

  it("finds transformer for a value", () => {
    const registry = new TransformerRegistry();
    registry.register(DateTransformer);
    registry.register(BigIntTransformer);
    expect(registry.findForValue(new Date())).toBe(DateTransformer);
    expect(registry.findForValue(100n)).toBe(BigIntTransformer);
    expect(registry.findForValue("hello")).toBeUndefined();
  });

  it("unregisters transformers", () => {
    const registry = new TransformerRegistry();
    registry.register(DateTransformer);
    expect(registry.unregister("Date")).toBe(true);
    expect(registry.has("Date")).toBe(false);
    expect(registry.unregister("Date")).toBe(false);
  });

  it("returns all registered types", () => {
    const registry = new TransformerRegistry();
    registry.register(DateTransformer);
    registry.register(BigIntTransformer);
    const types = registry.types();
    expect(types).toContain("Date");
    expect(types).toContain("BigInt");
  });

  it("clears all transformers", () => {
    const registry = new TransformerRegistry();
    registry.register(DateTransformer);
    registry.register(BigIntTransformer);
    registry.clear();
    expect(registry.size).toBe(0);
  });

  it("throws TransformerNotFoundError for missing type", () => {
    const registry = new TransformerRegistry();
    expect(() => registry.get("NonExistent")).toThrow();
  });
});

// ─── Individual Transformers ─────────────────────────────────

describe("DateTransformer", () => {
  it("round-trips Date objects", () => {
    const date = new Date("2026-08-30T12:00:00.000Z");
    const serialized = DateTransformer.serialize(date);
    const restored = DateTransformer.deserialize(serialized);
    expect(restored).toBeInstanceOf(Date);
    expect(restored.toISOString()).toBe(date.toISOString());
  });

  it("rejects invalid Date values", () => {
    expect(() =>
      DateTransformer.deserialize({ $value: "not-a-date" }),
    ).toThrow();
  });
});

describe("BigIntTransformer", () => {
  it("round-trips BigInt values", () => {
    const bigint = 12345678901234567890n;
    const serialized = BigIntTransformer.serialize(bigint);
    const restored = BigIntTransformer.deserialize(serialized);
    expect(restored).toBe(bigint);
  });

  it("rejects invalid BigInt strings", () => {
    expect(() =>
      BigIntTransformer.deserialize({ $value: "not-a-bigint" }),
    ).toThrow();
  });
});

describe("MapTransformer", () => {
  it("round-trips Map objects", () => {
    const map = new Map([
      ["a", 1],
      ["b", 2],
    ]);
    const serialized = MapTransformer.serialize(map);
    const restored = MapTransformer.deserialize(serialized);
    expect(restored).toBeInstanceOf(Map);
    expect(restored.get("a")).toBe(1);
    expect(restored.get("b")).toBe(2);
    expect(restored.size).toBe(2);
  });
});

describe("SetTransformer", () => {
  it("round-trips Set objects", () => {
    const set = new Set([1, 2, 3]);
    const serialized = SetTransformer.serialize(set);
    const restored = SetTransformer.deserialize(serialized);
    expect(restored).toBeInstanceOf(Set);
    expect(restored.has(1)).toBe(true);
    expect(restored.size).toBe(3);
  });
});

describe("BufferTransformer", () => {
  it("round-trips Uint8Array", () => {
    const bytes = new Uint8Array([10, 20, 30, 40, 50]);
    const serialized = BufferTransformer.serialize(bytes);
    const restored = BufferTransformer.deserialize(serialized);
    expect(restored).toBeInstanceOf(Uint8Array);
    expect([...restored]).toEqual([10, 20, 30, 40, 50]);
  });
});

describe("ErrorTransformer", () => {
  it("round-trips Error objects", () => {
    const error = new TypeError("wrong type");
    const serialized = ErrorTransformer.serialize(error);
    const restored = ErrorTransformer.deserialize(serialized);
    expect(restored).toBeInstanceOf(Error);
    expect(restored.message).toBe("wrong type");
    expect(restored.name).toBe("TypeError");
  });
});

// ─── SerializerRegistry ──────────────────────────────────────

describe("SerializerRegistry", () => {
  it("registers and retrieves serializers", () => {
    const registry = new SerializerRegistry();
    const json = new JSONSerializer();
    registry.register(json);
    expect(registry.has("json")).toBe(true);
    expect(registry.get("json")).toBe(json);
  });

  it("throws SerializerNotFoundError for missing serializer", () => {
    const registry = new SerializerRegistry();
    expect(() => registry.get("xml")).toThrow();
  });

  it("lists registered names", () => {
    const registry = new SerializerRegistry();
    registry.register(new JSONSerializer());
    expect(registry.names()).toContain("json");
    expect(registry.size).toBe(1);
  });

  it("unregisters serializers", () => {
    const registry = new SerializerRegistry();
    registry.register(new JSONSerializer());
    expect(registry.unregister("json")).toBe(true);
    expect(registry.has("json")).toBe(false);
  });

  it("clears all serializers", () => {
    const registry = new SerializerRegistry();
    registry.register(new JSONSerializer());
    registry.clear();
    expect(registry.size).toBe(0);
  });
});

// ─── Factory ─────────────────────────────────────────────────

describe("createSerializer", () => {
  it("creates a JSON serializer", () => {
    const serializer = createSerializer("json");
    expect(serializer).toBeInstanceOf(JSONSerializer);
    expect(serializer.name).toBe("json");
  });

  it("throws for unsupported format", () => {
    expect(() => createSerializer("xml")).toThrow();
  });
});

describe("createDefaultRegistry", () => {
  it("creates a registry with JSON serializer", () => {
    const registry = createDefaultRegistry();
    expect(registry.has("json")).toBe(true);
    expect(registry.size).toBe(1);
  });
});

// ─── Envelope ────────────────────────────────────────────────

describe("Envelope", () => {
  it("creates and unwraps envelope", () => {
    const data = '{"name":"Alice"}';
    const envelope = createEnvelope(data);
    expect(envelope.metadata.format).toBe("json");
    expect(envelope.metadata.version).toBe(1);
    expect(envelope.data).toBe(data);

    const unwrapped = unwrapEnvelope(envelope);
    expect(unwrapped).toBe(data);
  });

  it("validates format on unwrap", () => {
    const envelope = createEnvelope("data", "json");
    expect(() => unwrapEnvelope(envelope, "msgpack")).toThrow();
  });

  it("serializes to envelope and deserializes from it", () => {
    const serializer = new JSONSerializer();
    const data = { greeting: "hello" };
    const envelope = serializeToEnvelope(data, serializer);
    expect(envelope.metadata.format).toBe("json");

    const result = deserializeFromEnvelope(envelope, serializer);
    expect(result).toEqual(data);
  });

  it("accepts custom format and version", () => {
    const envelope = createEnvelope("data", "msgpack", {
      version: 2,
      contentType: "application/msgpack",
    });
    expect(envelope.metadata.format).toBe("msgpack");
    expect(envelope.metadata.version).toBe(2);
    expect(envelope.metadata.contentType).toBe("application/msgpack");
  });
});
