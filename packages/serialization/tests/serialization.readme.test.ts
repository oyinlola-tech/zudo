import { describe, it, expect } from "vitest";
import { createSerializer, TransformerRegistry, JSONSerializer, serializeToEnvelope, deserializeFromEnvelope } from "../src/index.js";

describe("README examples", () => {
  it("quick start", () => {
    const serializer = createSerializer("json", { preserveTypes: true });
    const json = serializer.serialize({ id: "123", createdAt: new Date() });
    const value = serializer.deserialize<{ id: string; createdAt: Date }>(json);
    expect(value.createdAt instanceof Date).toBe(true);
    serializer.serialize(value, { pretty: true, maxSize: 1_000_000 });
    serializer.deserialize(json, { strict: true, maxDepth: 64 });
  });
  it("type preservation", () => {
    const s = createSerializer("json", { preserveTypes: true });
    const src = { when: new Date(), amount: 42n, seen: new Set(["a"]), index: new Map([["k", new Date()]]), bytes: new Uint8Array([1,2,3]) };
    const json = s.serialize(src);
    const back = s.deserialize<typeof src>(json);
    expect(back.when instanceof Date).toBe(true);
    expect(back.amount).toBe(42n);
    expect(back.seen instanceof Set).toBe(true);
    expect(back.index.get("k") instanceof Date).toBe(true);
    expect(back.bytes instanceof Uint8Array).toBe(true);
  });
  it("custom transformer", () => {
    class Money { constructor(public readonly v: string) {} toString(){return this.v;} static parse(s:string){return new Money(s);} }
    const registry = new TransformerRegistry();
    registry.register({
      type: "Money",
      canSerialize: (v): v is Money => v instanceof Money,
      serialize: (v) => ({ $type: "Money", $value: (v as Money).toString() }),
      deserialize: (v) => Money.parse((v as { $value: string }).$value),
    });
    const serializer = new JSONSerializer({ transformers: registry });
    const j = serializer.serialize({ m: new Money("5") }, { preserveTypes: true });
    const back = serializer.deserialize<{ m: Money }>(j, { preserveTypes: true });
    expect(back.m instanceof Money).toBe(true);
  });
  it("envelope", () => {
    const serializer = createSerializer("json");
    const envelope = serializeToEnvelope({ a: 1 }, serializer);
    const value = deserializeFromEnvelope<{ a: number }>(
      envelope,
      serializer,
      "json",
    );
    expect(value.a).toBe(1);
  });

  it("envelope helpers forward options to the serializer", () => {
    const serializer = createSerializer("json");
    const envelope = serializeToEnvelope(
      { when: new Date("2020-01-01T00:00:00.000Z") },
      serializer,
      "json",
      { preserveTypes: true },
    );
    // preserveTypes must actually have reached serialize(): a plain
    // JSON.stringify would have written an untagged ISO string.
    expect(envelope.data).toContain("$type");

    const back = deserializeFromEnvelope<{ when: Date }>(
      envelope,
      serializer,
      "json",
      { preserveTypes: true },
    );
    expect(back.when instanceof Date).toBe(true);
    expect(back.when.toISOString()).toBe("2020-01-01T00:00:00.000Z");
  });

  it("deserializeFromEnvelope enforces the forwarded maxSize", () => {
    const serializer = createSerializer("json");
    const envelope = serializeToEnvelope({ blob: "x".repeat(500) }, serializer);
    expect(() =>
      deserializeFromEnvelope(envelope, serializer, "json", { maxSize: 16 }),
    ).toThrow(/too large/);
  });
});
