/**
 * The SerializeError for a value JSON would write as `{}` told the caller to
 * "keep the built-in transformers enabled" even when they were enabled and
 * no built-in handles the type (a RegExp, an ArrayBuffer), and it read
 * "a Error" / "a ArrayBuffer". The article now matches the type name, and
 * enabling the built-ins is only suggested when they are off and one of them
 * handles the type.
 */

import { describe, expect, it } from "vitest";

import { SerializeError } from "@zudojs/errors";

import { JSONSerializer } from "../src/index.js";

const ENABLE_BUILTINS = "keep the built-in transformers enabled";

function messageFor(serializer: JSONSerializer, value: unknown): string {
  try {
    serializer.serialize({ nested: [value] }, { preserveTypes: true });
  } catch (error) {
    expect(error).toBeInstanceOf(SerializeError);
    return (error as Error).message;
  }
  throw new Error("expected serialize to throw");
}

describe("SerializeError text for values JSON would write as {}", () => {
  const withBuiltins = new JSONSerializer();
  const withoutBuiltins = new JSONSerializer({ builtins: false });

  it.each([
    ["an Error", new Error("boom")],
    ["a Map", new Map([["a", 1]])],
    ["a Set", new Set([1])],
  ])("names %s and suggests the built-ins when they are disabled", (named, value) => {
    const message = messageFor(withoutBuiltins, value);

    expect(message).toContain(`Cannot serialize ${named} with preserveTypes`);
    expect(message).toContain("Register a transformer for");
    expect(message).toContain(ENABLE_BUILTINS);
  });

  it.each([
    ["a RegExp", /x/g],
    ["an ArrayBuffer", new ArrayBuffer(4)],
    ["a WeakMap", new WeakMap()],
    ["a DataView", new DataView(new ArrayBuffer(2))],
  ])("names %s and only suggests a transformer when the built-ins are enabled", (named, value) => {
    const message = messageFor(withBuiltins, value);

    expect(message).toContain(`Cannot serialize ${named} with preserveTypes`);
    expect(message).toContain("Register a transformer for");
    expect(message).not.toContain(ENABLE_BUILTINS);
    expect(message).not.toContain("builtins");
  });

  it("does not suggest the built-ins for a type none of them handles", () => {
    const message = messageFor(withoutBuiltins, /x/g);

    expect(message).toContain("Cannot serialize a RegExp");
    expect(message).not.toContain(ENABLE_BUILTINS);
  });
});
