import { describe, expect, it } from "vitest";
import {
  InvalidSerializedDataError,
  SerializationDepthError,
  SerializationError,
  SerializationPayloadTooLargeError,
  TransformerError,
} from "@zudojs/errors";
import {
  createSerializer,
  ESCAPED_OBJECT_TAG,
  JSONSerializer,
} from "../src/index.js";

const typed = new JSONSerializer({ defaults: { preserveTypes: true } });

describe("SER-01", () => {
  it("user objects carrying $type round-trip as plain objects", () => {
    const input = {
      bio: { $type: "Map", $value: [["isAdmin", true]] },
      nick: { $type: "BigInt", $value: "7" },
      when: { $type: "Date", $value: "not a date" },
      nested: { $type: "Object", $value: { $type: "Error", message: "x" } },
      real: new Map([["k", { $type: "Set", $value: [1] }]]),
    };
    const json = typed.serialize(input);
    expect(json).toContain(`"$type":"${ESCAPED_OBJECT_TAG}"`);
    expect(typed.deserialize(json)).toEqual(input);
  });

  it("previously written (unescaped) tags are still revived", () => {
    const legacy = '{"at":{"$type":"Date","$value":"2020-01-01T00:00:00.000Z"}}';
    const out = typed.deserialize<{ at: Date }>(legacy);
    expect(out.at).toBeInstanceOf(Date);
  });

  it("a malformed tag no longer makes the record unreadable", () => {
    const bad = '{"at":{"$type":"Date","$value":"nope"},"ok":1}';
    expect(typed.deserialize(bad)).toEqual({
      at: { $type: "Date", $value: "nope" },
      ok: 1,
    });
    expect(() => typed.deserialize(bad, { strict: true })).toThrow(
      SerializationError,
    );
  });

  it("the escape tag cannot be registered as a transformer", () => {
    expect(() =>
      typed.registerTransformer({
        type: ESCAPED_OBJECT_TAG,
        canSerialize: (_v: unknown): _v is never => false,
        serialize: (v) => v,
        deserialize: (v) => v,
      }),
    ).toThrow(TransformerError);
  });
});

describe("SER-03", () => {
  it("BigInt tags past the digit limit are rejected before BigInt() runs", () => {
    const payload = `{"$type":"BigInt","$value":"${"9".repeat(5000)}"}`;
    expect(() => typed.deserialize(payload, { strict: true })).toThrow(
      InvalidSerializedDataError,
    );
    expect(typeof typed.deserialize(payload)).toBe("object");
    expect(() => typed.serialize(10n ** 5000n)).toThrow(SerializationError);
    expect(typed.deserialize(typed.serialize(-(10n ** 40n)))).toBe(
      -(10n ** 40n),
    );
  });
});

describe("SER-04", () => {
  it("failures throw @zudojs/errors serialization errors", () => {
    expect(() => typed.serialize(new Date(Number.NaN))).toThrow(
      SerializationError,
    );
    expect(() => typed.deserialize("{nope")).toThrow(
      InvalidSerializedDataError,
    );
    expect(() => typed.serialize({ a: "x".repeat(50) }, { maxSize: 10 })).toThrow(
      SerializationPayloadTooLargeError,
    );
    expect(() => typed.deserialize('"xxxxxxxxxxxx"', { maxSize: 5 })).toThrow(
      SerializationPayloadTooLargeError,
    );
    expect(() => typed.serialize({ a: { b: { c: 1 } } }, { maxDepth: 1 })).toThrow(
      SerializationDepthError,
    );
  });
});

describe("SER-05", () => {
  it("createSerializer forwards maxDepth/maxSize/strict as instance defaults", () => {
    const s = createSerializer("json", { maxDepth: 1, maxSize: 64, strict: true });
    expect(() => s.serialize({ a: { b: 1 } })).toThrow(/depth/i);
    expect(() => s.serialize({ a: "x".repeat(100) })).toThrow(/too large/);
    expect(() =>
      s.deserialize('{"$type":"Nope"}', { preserveTypes: true, maxDepth: 5 }),
    ).toThrow(/Unknown serialization type tag/);
  });
});

describe("data/VAL-01 via serialize", () => {
  it("sparse arrays serialize with preserveTypes", () => {
    // eslint-disable-next-line no-sparse-arrays
    expect(typed.serialize({ list: [1, , 3] })).toBe('{"list":[1,null,3]}');
  });
});
