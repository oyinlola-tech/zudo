/**
 * Regression tests for the round-7 audit findings (SER-01 … SER-05).
 */

import { describe, it, expect } from "vitest";

import { JSONSerializer } from "../src/serializerJson/index.js";
import {
  createEnvelope,
  unwrapEnvelope,
  assertValidEnvelope,
  contentTypeForFormat,
  serializeToEnvelope,
  deserializeFromEnvelope,
} from "../src/serializerEnvelope/index.js";
import { createSerializer } from "../src/serializerRegistry/index.js";
import { SERIALIZATION_SCHEMA_VERSION } from "@zudojs/constants";

const serializer = new JSONSerializer();

/* ─── SER-01: prototype pollution ────────────────────────────────────────── */

describe("SER-01: reconstruction cannot touch the prototype", () => {
  it("drops __proto__ instead of reassigning the prototype", () => {
    const payload = '{"a":{"__proto__":{"polluted":"yes"}}}';
    const back = serializer.deserialize<
      Record<string, Record<string, unknown>>
    >(payload, { preserveTypes: true });

    expect(back.a?.polluted).toBeUndefined();
    expect(Object.getPrototypeOf(back.a) as unknown).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("drops constructor and prototype keys too", () => {
    const payload = '{"constructor":{"x":1},"prototype":{"y":2},"ok":3}';
    const back = serializer.deserialize<Record<string, unknown>>(payload, {
      preserveTypes: true,
    });
    expect(Object.keys(back)).toEqual(["ok"]);
  });

  it("keeps them as real own properties when explicitly allowed", () => {
    const payload = '{"__proto__":{"polluted":"yes"}}';
    const back = serializer.deserialize<Record<string, unknown>>(payload, {
      preserveTypes: true,
      allowUnsafeKeys: true,
    });

    // An own property — never a prototype assignment.
    expect(Object.keys(back)).toContain("__proto__");
    expect(Object.getPrototypeOf(back) as unknown).toBe(Object.prototype);
    expect((back as { polluted?: unknown }).polluted).toBeUndefined();
  });

  it("does not pollute on the serialize side either", () => {
    const hostile = JSON.parse('{"__proto__":{"x":1},"keep":2}') as Record<
      string,
      unknown
    >;
    const json = serializer.serialize(hostile, { preserveTypes: true });
    expect(JSON.parse(json)).toEqual({ keep: 2 });
  });
});

/* ─── SER-02: type tags and input bounds ─────────────────────────────────── */

describe("SER-02: unknown type tags and input size", () => {
  it("treats an unknown tag as ordinary data", () => {
    const back = serializer.deserialize<Record<string, unknown>>(
      '{"$type":"premium","plan":1}',
      { preserveTypes: true },
    );
    expect(back).toEqual({ $type: "premium", plan: 1 });
  });

  it("does not let a two-byte payload crash the consumer", () => {
    expect(() =>
      serializer.deserialize('{"$type":"Widget"}', { preserveTypes: true }),
    ).not.toThrow();
  });

  it("still reports an unknown tag under strict mode", () => {
    expect(() =>
      serializer.deserialize('{"$type":"Widget"}', {
        preserveTypes: true,
        strict: true,
      }),
    ).toThrow(/Unknown serialization type tag/);
  });

  it("bounds the input, not just the output", () => {
    const big = JSON.stringify({ x: "a".repeat(500) });
    expect(() => serializer.deserialize(big, { maxSize: 100 })).toThrow(
      /too large/,
    );
    expect(() =>
      serializer.deserialize(big, { maxSize: 100, preserveTypes: true }),
    ).toThrow(/too large/);
  });

  it("still restores a known tag", () => {
    const json = serializer.serialize(
      { when: new Date("2020-01-01T00:00:00Z") },
      { preserveTypes: true },
    );
    const back = serializer.deserialize<{ when: Date }>(json, {
      preserveTypes: true,
    });
    expect(back.when).toBeInstanceOf(Date);
  });
});

/* ─── SER-03: Map and Set round-trips ────────────────────────────────────── */

describe("SER-03: containers restore their children", () => {
  it("restores a Date inside a Map", () => {
    const value = {
      m: new Map<string, unknown>([["d", new Date("2020-01-01T00:00:00Z")]]),
    };
    const json = serializer.serialize(value, { preserveTypes: true });
    const back = serializer.deserialize<{ m: Map<string, unknown> }>(json, {
      preserveTypes: true,
    });

    expect(back.m).toBeInstanceOf(Map);
    expect(back.m.get("d")).toBeInstanceOf(Date);
    expect((back.m.get("d") as Date).toISOString()).toBe(
      "2020-01-01T00:00:00.000Z",
    );
  });

  it("restores a Date inside a Set", () => {
    const json = serializer.serialize(
      { s: new Set([new Date("2020-01-01T00:00:00Z")]) },
      { preserveTypes: true },
    );
    const back = serializer.deserialize<{ s: Set<unknown> }>(json, {
      preserveTypes: true,
    });

    expect(back.s).toBeInstanceOf(Set);
    expect([...back.s][0]).toBeInstanceOf(Date);
  });

  it("restores a BigInt nested in a Map value", () => {
    const json = serializer.serialize(
      { m: new Map<string, unknown>([["n", 42n]]) },
      { preserveTypes: true },
    );
    const back = serializer.deserialize<{ m: Map<string, unknown> }>(json, {
      preserveTypes: true,
    });
    expect(back.m.get("n")).toBe(42n);
  });

  it("restores nested containers", () => {
    const json = serializer.serialize(
      { outer: new Map<string, unknown>([["inner", new Set([1n, 2n])]]) },
      { preserveTypes: true },
    );
    const back = serializer.deserialize<{ outer: Map<string, unknown> }>(json, {
      preserveTypes: true,
    });
    const inner = back.outer.get("inner");
    expect(inner).toBeInstanceOf(Set);
    expect([...(inner as Set<unknown>)]).toEqual([1n, 2n]);
  });
});

/* ─── SER-04: error stacks ───────────────────────────────────────────────── */

describe("SER-04: error stacks are opt-in", () => {
  it("omits the stack by default", () => {
    const json = serializer.serialize(
      { e: new Error("boom") },
      { preserveTypes: true },
    );
    expect(json).not.toContain('"stack"');
    expect(json).toContain('"message":"boom"');
  });

  it("includes the stack when explicitly asked", () => {
    const json = serializer.serialize(
      { e: new Error("boom") },
      { preserveTypes: true, includeStack: true },
    );
    expect(json).toContain('"stack"');
  });

  it("does not let a wire-supplied stack overwrite the real one", () => {
    const back = serializer.deserialize<{ e: Error }>(
      '{"e":{"$type":"Error","message":"x","stack":"FAKE"}}',
      { preserveTypes: true },
    );
    expect(back.e).toBeInstanceOf(Error);
    expect(back.e.stack).not.toBe("FAKE");
    expect(
      (back.e as unknown as { originalStack?: string }).originalStack,
    ).toBe("FAKE");
  });
});

/* ─── SER-05: envelope and factory ───────────────────────────────────────── */

describe("SER-05: envelope metadata is enforced", () => {
  it("rejects a malformed envelope with a domain error", () => {
    expect(() => unwrapEnvelope({} as never)).toThrow(/missing metadata/);
    expect(() => assertValidEnvelope(null)).toThrow(/expected an object/);
    expect(() => assertValidEnvelope({ metadata: { format: "json" } })).toThrow(
      /data must be/,
    );
  });

  it("rejects a payload from a newer schema version", () => {
    const envelope = createEnvelope("{}", "json", {
      version: SERIALIZATION_SCHEMA_VERSION + 1,
    });
    expect(() => unwrapEnvelope(envelope)).toThrow(
      /Unsupported envelope schema/,
    );
  });

  it("accepts the current schema version", () => {
    expect(unwrapEnvelope(createEnvelope("{}", "json"))).toBe("{}");
  });

  it("derives contentType from the format", () => {
    expect(contentTypeForFormat("json")).toBe("application/json");
    expect(createEnvelope("x", "messagepack").metadata.contentType).toBe(
      "application/msgpack",
    );
    expect(createEnvelope("x", "text").metadata.contentType).toBe("text/plain");
  });

  it("takes contentType from the serializer when wrapping", () => {
    const envelope = serializeToEnvelope({ a: 1 }, new JSONSerializer());
    expect(envelope.metadata.contentType).toBe("application/json");
  });

  it("rejects an unsupported encoding rather than assuming UTF-8", () => {
    const envelope = createEnvelope(new TextEncoder().encode("{}"), "json", {
      encoding: "utf-16le",
    });
    expect(() =>
      deserializeFromEnvelope(envelope, new JSONSerializer()),
    ).toThrow(/Unsupported envelope encoding/);
  });

  it("round-trips a binary envelope under UTF-8", () => {
    const envelope = createEnvelope(
      new TextEncoder().encode('{"a":1}'),
      "json",
    );
    expect(
      deserializeFromEnvelope<{ a: number }>(envelope, new JSONSerializer()),
    ).toEqual({ a: 1 });
  });

  it("honours factory options instead of discarding them", () => {
    const pretty = createSerializer("json", { pretty: true });
    expect(pretty.serialize({ a: 1 })).toContain("\n");

    const typed = createSerializer("json", { preserveTypes: true });
    expect(typed.serialize({ d: new Date("2020-01-01T00:00:00Z") })).toContain(
      "$type",
    );

    // A per-call option still wins over the instance default.
    expect(pretty.serialize({ a: 1 }, { pretty: false })).not.toContain("\n");
  });
});
