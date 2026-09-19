/**
 * Round 10 phase 2 regressions for @zudojs/tenancy (leaf handoff X-05).
 */

import { describe, expect, it } from "vitest";
import * as constants from "@zudojs/constants";

import {
  createTenantId,
  InvalidTenantIdError,
  isValidTenantId,
  MAX_TENANT_ID_LENGTH,
  TENANT_ID_PATTERN,
} from "../src/index.js";

const CORPUS: readonly string[] = [
  "acme",
  "  ACME  ",
  "tenant_01",
  "a-b-c",
  "Ａｃｍｅ",
  "x".repeat(64),
  "x".repeat(65),
  "",
  "   ",
  "-leading",
  "_leading",
  "has space",
  "dot.ted",
  "slash/x",
  "../etc",
  "tenant:1",
  "ümlaut",
];

function outcome(create: (value: string) => string, value: string): string {
  try {
    return `ok:${create(value)}`;
  } catch {
    return "rejected";
  }
}

describe("X-05 (one tenant-id rule)", () => {
  it("shares the pattern and length limit with @zudojs/constants", () => {
    expect(TENANT_ID_PATTERN).toBe(constants.TENANT_ID_PATTERN);
    expect(MAX_TENANT_ID_LENGTH).toBe(constants.MAX_TENANT_ID_LENGTH);
  });

  it("accepts, normalizes and rejects exactly what constants does", () => {
    for (const value of CORPUS) {
      expect(outcome(createTenantId, value)).toBe(
        outcome(constants.createTenantId, value),
      );
    }
    expect(createTenantId("  ACME  ")).toBe("acme");
  });

  it("still throws InvalidTenantIdError from the tenancy API", () => {
    expect(() => createTenantId("../etc")).toThrow(InvalidTenantIdError);
    expect(() => createTenantId(42 as unknown as string)).toThrow(
      InvalidTenantIdError,
    );
    expect(isValidTenantId("x".repeat(65))).toBe(false);
  });
});
