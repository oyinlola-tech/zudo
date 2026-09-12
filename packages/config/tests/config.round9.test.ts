/**
 * Regression tests for the round-9 audit findings (CFG-R9-*).
 */

import { describe, it, expect } from "vitest";

import {
  validateConfigValue,
  validateConfigObject,
  ConfigValueType,
} from "../src/index.js";

describe("CFG-R9-01: a string pattern with the g or y flag validates consistently", () => {
  it("accepts the same value on every call", () => {
    const schema = { type: ConfigValueType.STRING, pattern: /^abc$/g } as const;
    expect(validateConfigValue("abc", schema).valid).toBe(true);
    expect(validateConfigValue("abc", schema).valid).toBe(true);
    expect(validateConfigValue("abc", schema).valid).toBe(true);
    expect(validateConfigValue("abd", schema).valid).toBe(false);

    const sticky = { type: ConfigValueType.STRING, pattern: /^abc$/y } as const;
    expect(validateConfigValue("abc", sticky).valid).toBe(true);
    expect(validateConfigValue("abc", sticky).valid).toBe(true);
  });

  it("does not mutate the caller's RegExp", () => {
    const pattern = /^abc$/g;
    validateConfigValue("abc", { type: ConfigValueType.STRING, pattern });
    expect(pattern.lastIndex).toBe(0);
  });
});

describe("CFG-R9-02: an array item schema's transform and default reach the returned value", () => {
  it("returns the transformed items", () => {
    const result = validateConfigValue([" a ", "b "], {
      type: ConfigValueType.ARRAY,
      items: {
        type: ConfigValueType.STRING,
        transform: (value) => String(value).trim(),
      },
    });
    expect(result.valid).toBe(true);
    expect(result.value).toEqual(["a", "b"]);
  });

  it("applies item transforms through a property schema and a nested object", () => {
    const result = validateConfigObject(
      { ports: ["80", "443"] },
      {
        type: ConfigValueType.OBJECT,
        properties: {
          ports: {
            type: ConfigValueType.ARRAY,
            items: {
              type: ConfigValueType.STRING,
              transform: (value) => Number(value),
            },
          },
        },
      },
    );
    expect(result.valid).toBe(true);
    expect(result.value).toEqual({ ports: [80, 443] });
  });

  it("still reports item issues and returns no value when an item is invalid", () => {
    const result = validateConfigValue(["a", 1], {
      type: ConfigValueType.ARRAY,
      items: { type: ConfigValueType.STRING, transform: (v) => String(v) },
    });
    expect(result.valid).toBe(false);
    expect(result.value).toBeUndefined();
    expect(result.issues[0]?.path).toBe("$[1]");
  });

  it("leaves an array untouched when the item schema has no transform", () => {
    const input = [1, 2];
    const result = validateConfigValue(input, {
      type: ConfigValueType.ARRAY,
      items: { type: ConfigValueType.NUMBER },
    });
    expect(result.value).toEqual([1, 2]);
  });
});
