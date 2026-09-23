import { describe, it, expect } from "vitest";
import { JSONSerializer } from "../src/index.js";

const serializer = new JSONSerializer();

function roundTrip(error: Error, includeStack = false): Error {
  const json = serializer.serialize(
    { e: error },
    { preserveTypes: true, includeStack },
  );
  return serializer.deserialize<{ e: Error }>(json, { preserveTypes: true }).e;
}

describe("post-release — built-in Error subclasses keep their class", () => {
  it.each([
    ["TypeError", TypeError],
    ["RangeError", RangeError],
    ["SyntaxError", SyntaxError],
    ["ReferenceError", ReferenceError],
    ["EvalError", EvalError],
    ["URIError", URIError],
  ] as const)("a rebuilt %s is instanceof %s", (name, Ctor) => {
    const back = roundTrip(new Ctor("bad input"));
    expect(back).toBeInstanceOf(Ctor);
    expect(back).toBeInstanceOf(Error);
    expect(back.name).toBe(name);
    expect(back.message).toBe("bad input");
  });

  it("a rebuilt AggregateError is instanceof AggregateError", () => {
    const back = roundTrip(new AggregateError([new Error("a")], "many"));
    expect(back).toBeInstanceOf(AggregateError);
    expect(back.message).toBe("many");
    expect((back as AggregateError).errors).toEqual([]);
  });

  it("an unknown name falls back to Error with the name kept", () => {
    const original = new Error("nope");
    original.name = "PaymentDeclinedError";
    const back = roundTrip(original);
    expect(back.constructor).toBe(Error);
    expect(back.name).toBe("PaymentDeclinedError");
  });

  it("a name from the prototype chain is not treated as a built-in", () => {
    const back = serializer.deserialize<{ e: Error }>(
      '{"e":{"$type":"Error","name":"toString","message":"x"}}',
      { preserveTypes: true },
    ).e;
    expect(back.constructor).toBe(Error);
    expect(back.name).toBe("toString");
  });

  it("keeps the code on a rebuilt built-in", () => {
    const original = Object.assign(new RangeError("out"), { code: "E_RANGE" });
    const back = roundTrip(original);
    expect(back).toBeInstanceOf(RangeError);
    expect((back as unknown as { code?: string }).code).toBe("E_RANGE");
  });
});

describe("post-release — a rebuilt error does not borrow the reader's stack", () => {
  it("without includeStack, .stack is the header line with no frames", () => {
    const back = roundTrip(new TypeError("bad input"));
    expect(back.stack).toBe("TypeError: bad input");
    expect(back.stack).not.toContain("\n");
    expect(
      (back as unknown as { originalStack?: string }).originalStack,
    ).toBeUndefined();
  });

  it("a custom name appears in the header line", () => {
    const original = new Error("declined");
    original.name = "PaymentDeclinedError";
    expect(roundTrip(original).stack).toBe("PaymentDeclinedError: declined");
  });

  it("an empty message gives just the name", () => {
    expect(roundTrip(new Error("")).stack).toBe("Error");
  });

  it("with includeStack, the wire stack is on originalStack and .stack has no frames", () => {
    const original = new Error("boom");
    const back = roundTrip(original, true);
    expect(back.stack).toBe("Error: boom");
    expect((back as unknown as { originalStack?: string }).originalStack).toBe(
      original.stack,
    );
  });
});
