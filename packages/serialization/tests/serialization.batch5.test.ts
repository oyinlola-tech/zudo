/**
 * @zudojs/serialization — batch 5 regression tests: built-ins behind a
 * custom registry, bare-value transformer returns, lossy values without a
 * transformer.
 */

import { describe, expect, it } from "vitest";
import { SerializeError, isSerializationError } from "@zudojs/errors";

import {
  JSONSerializer,
  TransformerRegistry,
  createBuiltinTransformers,
  createSerializer,
  type TypeTransformer,
} from "../src/index.js";

class Money {
  constructor(readonly cents: bigint, readonly currency: string) {}
  toString(): string {
    return `${this.cents} ${this.currency}`;
  }
  static parse(text: string): Money {
    const [cents, currency] = text.split(" ");
    return new Money(BigInt(cents!), currency!);
  }
}

const bareMoney: TypeTransformer<Money> = {
  type: "Money",
  canSerialize: (v): v is Money => v instanceof Money,
  serialize: (v) => v.toString(),
  deserialize: (v) => Money.parse((v as { $value: string }).$value),
};

const fullMoney: TypeTransformer<Money> = {
  ...bareMoney,
  serialize: (v) => ({ $type: "Money", $value: v.toString() }),
};

const sample = () => ({
  when: new Date("2026-01-02T03:04:05.000Z"),
  seen: new Set(["a"]),
  index: new Map([["k", 1n]]),
  price: new Money(1250n, "USD"),
});

describe("a custom registry keeps the built-in transformers", () => {
  it("round-trips Date, Set, Map and BigInt next to a custom type (README example)", () => {
    const registry = new TransformerRegistry();
    registry.register(fullMoney);
    const serializer = new JSONSerializer({ transformers: registry });

    const json = serializer.serialize(sample(), { preserveTypes: true });
    const back = serializer.deserialize<ReturnType<typeof sample>>(json, {
      preserveTypes: true,
    });

    expect(back.when).toBeInstanceOf(Date);
    expect(back.seen).toEqual(new Set(["a"]));
    expect(back.index).toEqual(new Map([["k", 1n]]));
    expect(back.price).toEqual(new Money(1250n, "USD"));
    expect(registry.size).toBe(1);
  });

  it("lets the caller's registry override a built-in tag", () => {
    const registry = new TransformerRegistry();
    registry.register({
      type: "Date",
      canSerialize: (v): v is Date => v instanceof Date,
      serialize: (v) => (v as Date).getTime(),
      deserialize: (v) => new Date((v as { $value: number }).$value),
    });
    const serializer = new JSONSerializer({ transformers: registry });

    expect(serializer.serialize(new Date(5), { preserveTypes: true })).toBe(
      '{"$type":"Date","$value":5}',
    );
  });

  it("the factory forwards builtins and still defaults to them", () => {
    const registry = new TransformerRegistry();
    const withBuiltins = createSerializer("json", { transformers: registry, preserveTypes: true });
    expect(withBuiltins.deserialize(withBuiltins.serialize(new Set([1])))).toEqual(new Set([1]));

    const without = createSerializer("json", {
      transformers: registry,
      builtins: false,
      preserveTypes: true,
    });
    expect(() => without.serialize(new Set([1]))).toThrow(SerializeError);
  });

  it("exposes the built-ins for composing a registry by hand", () => {
    expect(createBuiltinTransformers().types()).toEqual(
      expect.arrayContaining(["Date", "BigInt", "Map", "Set", "Error"]),
    );
  });
});

describe("transformer serialize() may return just the value", () => {
  it("wraps a bare return as { $type, $value } and revives it", () => {
    const registry = new TransformerRegistry();
    registry.register(bareMoney);
    const serializer = new JSONSerializer({ transformers: registry });

    const json = serializer.serialize({ price: new Money(99n, "EUR") }, { preserveTypes: true });
    expect(JSON.parse(json)).toEqual({ price: { $type: "Money", $value: "99 EUR" } });
    expect(
      serializer.deserialize<{ price: Money }>(json, { preserveTypes: true }).price,
    ).toEqual(new Money(99n, "EUR"));
  });

  it("produces identical output for bare and full-envelope returns", () => {
    const bare = new TransformerRegistry();
    bare.register(bareMoney);
    const full = new TransformerRegistry();
    full.register(fullMoney);
    const value = { price: new Money(1n, "GBP") };

    expect(new JSONSerializer({ transformers: bare }).serialize(value, { preserveTypes: true })).toBe(
      new JSONSerializer({ transformers: full }).serialize(value, { preserveTypes: true }),
    );
  });

  it("wraps a bare plain-object return and transforms nested special values", () => {
    const registry = new TransformerRegistry();
    registry.register({
      ...bareMoney,
      serialize: (v) => ({ cents: (v as Money).cents, currency: (v as Money).currency }),
      deserialize: (v) => {
        const body = (v as { $value: { cents: bigint; currency: string } }).$value;
        return new Money(body.cents, body.currency);
      },
    });
    const serializer = new JSONSerializer({ transformers: registry });
    const json = serializer.serialize(new Money(7n, "JPY"), { preserveTypes: true });

    expect(JSON.parse(json)).toEqual({
      $type: "Money",
      $value: { cents: { $type: "BigInt", $value: "7" }, currency: "JPY" },
    });
    expect(serializer.deserialize(json, { preserveTypes: true })).toEqual(new Money(7n, "JPY"));
  });
});

describe("values no transformer handles are never silently written as {}", () => {
  const bareSerializer = () =>
    new JSONSerializer({ transformers: new TransformerRegistry(), builtins: false });

  it.each([
    ["Map", new Map([["a", 1]])],
    ["Set", new Set([1])],
    ["Error", new Error("boom")],
    ["RegExp", /x/g],
  ])("throws a SerializeError for a %s", (name, value) => {
    const error = (() => {
      try {
        bareSerializer().serialize({ nested: [value] }, { preserveTypes: true });
      } catch (caught) {
        return caught;
      }
      return undefined;
    })();
    expect(error).toBeInstanceOf(SerializeError);
    expect(isSerializationError(error)).toBe(true);
    expect((error as Error).message).toMatch(
      new RegExp(`Cannot serialize an? ${name} `),
    );
  });

  it("builtins: false without a registry uses no transformers at all", () => {
    const serializer = new JSONSerializer({ builtins: false });
    expect(() => serializer.serialize(new Map(), { preserveTypes: true })).toThrow(SerializeError);
    expect(serializer.serialize({ a: 1 }, { preserveTypes: true })).toBe('{"a":1}');
  });

  it("leaves the fast path (no preserveTypes) as plain JSON.stringify", () => {
    expect(bareSerializer().serialize(new Map([["a", 1]]))).toBe("{}");
  });
});
