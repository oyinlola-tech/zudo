import { describe, it, expect } from "vitest";
import { SerializationLimits } from "@zudojs/constants";
import {
  InvalidSerializedDataError,
  SerializationDepthError,
  TransformerError,
} from "@zudojs/errors";
import {
  JSONSerializer,
  TransformerRegistry,
  assertValidEnvelope,
  createEnvelope,
  deserializeFromEnvelope,
  unwrapEnvelope,
} from "../src/index.js";
import type { SerializedEnvelope } from "../src/index.js";

/** `{n:{n:…{leaf:1}}}`, `levels` deep. */
function deepObject(levels: number): unknown {
  let value: unknown = { leaf: 1 };
  for (let index = 0; index < levels; index++) value = { n: value };
  return value;
}

describe("TYPE-03 — deep input is a depth error on both serialize paths", () => {
  const serializer = new JSONSerializer();
  const value = deepObject(600);

  it("preserveTypes reports a depth error, not a circular reference", () => {
    let thrown: unknown;
    try {
      serializer.serialize(value, { preserveTypes: true, maxDepth: 128 });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(SerializationDepthError);
  });

  it("agrees with the fast path", () => {
    const names = (fn: () => unknown): string => {
      try {
        fn();
        return "no throw";
      } catch (error) {
        return (error as Error).constructor.name;
      }
    };

    expect(
      names(() => serializer.serialize(value, { preserveTypes: true })),
    ).toBe(names(() => serializer.serialize(value, { maxDepth: 128 })));
  });

  it("still detects a genuine cycle under preserveTypes", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic["self"] = cyclic;

    expect(() => serializer.serialize(cyclic, { preserveTypes: true })).toThrow(
      /[Cc]ircular/,
    );
  });
});

describe("TYPE-05 — an oversized $type tag is rejected", () => {
  const serializer = new JSONSerializer();
  const huge = "x".repeat(SerializationLimits.MAX_TYPE_TAG_LENGTH + 1000);

  it("rejects the tag rather than accepting it as data", () => {
    expect(() =>
      serializer.deserialize(JSON.stringify({ $type: huge, a: 1 }), {
        preserveTypes: true,
      }),
    ).toThrow(InvalidSerializedDataError);
  });

  it("does not put the unbounded tag into the error message", () => {
    let message = "";
    try {
      serializer.deserialize(JSON.stringify({ $type: huge, a: 1 }), {
        preserveTypes: true,
        strict: true,
      });
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message.length).toBeLessThan(
      SerializationLimits.MAX_TYPE_TAG_LENGTH + 200,
    );
  });

  it("leaves a tag within the limit alone", () => {
    const tag = "y".repeat(SerializationLimits.MAX_TYPE_TAG_LENGTH);
    const restored = serializer.deserialize<Record<string, unknown>>(
      JSON.stringify({ $type: tag, a: 1 }),
      { preserveTypes: true },
    );

    expect(restored["a"]).toBe(1);
  });
});

describe("TYPE-06 — envelope validation throws a typed serialization error", () => {
  it("rejects a non-object envelope", () => {
    expect(() => assertValidEnvelope("nope")).toThrow(
      InvalidSerializedDataError,
    );
    expect(() => assertValidEnvelope(null)).toThrow(InvalidSerializedDataError);
  });

  it("rejects missing metadata, format and data", () => {
    expect(() => assertValidEnvelope({})).toThrow(InvalidSerializedDataError);
    expect(() => assertValidEnvelope({ metadata: {}, data: "x" })).toThrow(
      InvalidSerializedDataError,
    );
    expect(() =>
      assertValidEnvelope({ metadata: { format: "json" }, data: 1 }),
    ).toThrow(InvalidSerializedDataError);
  });

  it("rejects a bad or future schema version", () => {
    expect(() =>
      assertValidEnvelope({
        metadata: { format: "json", version: 1.5 },
        data: "1",
      }),
    ).toThrow(InvalidSerializedDataError);
    expect(() =>
      assertValidEnvelope({
        metadata: { format: "json", version: 9999 },
        data: "1",
      }),
    ).toThrow(InvalidSerializedDataError);
  });

  it("rejects a format mismatch in unwrapEnvelope", () => {
    const envelope = createEnvelope("1", "json");

    expect(() => unwrapEnvelope(envelope, "messagepack")).toThrow(
      InvalidSerializedDataError,
    );
  });

  it("rejects an unsupported encoding in deserializeFromEnvelope", () => {
    const envelope: SerializedEnvelope = {
      metadata: {
        format: "json",
        version: 1,
        contentType: "application/json",
        encoding: "latin1",
      },
      data: new Uint8Array([49]),
    };

    expect(() =>
      deserializeFromEnvelope(envelope, new JSONSerializer()),
    ).toThrow(InvalidSerializedDataError);
  });

  it("reports a full transformer registry as a TransformerError", () => {
    const registry = new TransformerRegistry();
    for (let index = 0; index < SerializationLimits.MAX_TRANSFORMERS; index++) {
      registry.register({
        type: `t${index}`,
        canSerialize: (value: unknown): value is never => false,
        serialize: (value: unknown) => value,
        deserialize: (value: unknown) => value,
      });
    }

    expect(() =>
      registry.register({
        type: "overflow",
        canSerialize: (value: unknown): value is never => false,
        serialize: (value: unknown) => value,
        deserialize: (value: unknown) => value,
      }),
    ).toThrow(TransformerError);
  });
});
