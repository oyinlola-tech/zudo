/**
 * Round 12 regressions for @zudojs/types (shared length helpers backing
 * validation #57/#60 and schema #60).
 */

import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import { characterLength, jsonStringByteLength } from "../src/index.js";

describe("characterLength", () => {
  it("counts code points, not UTF-16 units", () => {
    expect(characterLength("")).toBe(0);
    expect(characterLength("abc")).toBe(3);
    expect(characterLength("🛒🛒")).toBe(2);
    expect("🛒🛒".length).toBe(4);
    expect(characterLength("a₦b")).toBe(3);
  });

  it("counts a lone surrogate as one character", () => {
    expect(characterLength("\ud83d")).toBe(1);
    expect(characterLength("\ud83dx")).toBe(2);
  });
});

describe("jsonStringByteLength", () => {
  const samples = [
    "",
    "plain ascii",
    "quote \" and backslash \\",
    "tab\tnewline\ncr\rbs\bff\f",
    "\u0001\u001f control",
    "₦".repeat(1000),
    "naïve café",
    "🛒 emoji 🛒",
    "\ud83d lone high",
    "lone low \udc00",
    "混合 mixed 🎉  ",
  ];

  it.each(samples)("matches the UTF-8 size of JSON.stringify(%j)", (s) => {
    expect(jsonStringByteLength(s)).toBe(
      Buffer.byteLength(JSON.stringify(s), "utf8"),
    );
  });
});
