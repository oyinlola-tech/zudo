/**
 * Round 10 phase 2 regressions for @zudojs/config (cross-package handoffs).
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { SCHEMA_FORBIDDEN_KEYS } from "@zudojs/constants";

import { createConfigStore, isUnsafeConfigKey } from "../src/index.js";

const SRC = fileURLToPath(new URL("../src", import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith(".ts") ? [full] : [];
  });
}

function codeLines(file: string): string[] {
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line));
}

describe("CONFIG-05 (phase 2)", () => {
  it("isUnsafeConfigKey is SCHEMA_FORBIDDEN_KEYS from @zudojs/constants", () => {
    for (const key of SCHEMA_FORBIDDEN_KEYS) {
      expect(isUnsafeConfigKey(key)).toBe(true);
    }
    for (const key of ["name", "__proto", "Constructor", "proto", ""]) {
      expect(isUnsafeConfigKey(key)).toBe(SCHEMA_FORBIDDEN_KEYS.has(key));
    }
  });

  it("no source file writes object keys by assignment or Object.assign", () => {
    const offenders: string[] = [];
    const assignment = /[\w)\]]\[[^\][]+\]\s*(\?\?|\|\||&&)?=(?!=)/u;
    for (const file of sourceFiles(SRC)) {
      for (const line of codeLines(file)) {
        if (assignment.test(line) || /Object\.assign\(|Reflect\.set\(/u.test(line)) {
          offenders.push(`${file}: ${line.trim()}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("every unsafe key survives the store as an inert own property", () => {
    const store = createConfigStore();
    for (const key of SCHEMA_FORBIDDEN_KEYS) store.set(key, { isAdmin: true });
    const object = store.toObject();
    expect(Object.getPrototypeOf(object)).toBe(Object.prototype);
    for (const key of SCHEMA_FORBIDDEN_KEYS) {
      expect(Object.hasOwn(object, key)).toBe(true);
    }
    expect(({} as Record<string, unknown>)["isAdmin"]).toBeUndefined();
  });
});
