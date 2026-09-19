/**
 * Audit round 10 regressions for @zudojs/auth: password hashing parameters.
 */

import { describe, it, expect } from "vitest";
import { randomBytes, scryptSync } from "node:crypto";

import { hashPassword, needsRehash, verifyPassword } from "../src/index.js";

describe("security/CRYPTO-01 (auth side)", () => {
  it("new hashes use the OWASP N=2^14, r=8, p=5 row", async () => {
    const hash = await hashPassword("correct horse");
    expect(hash.startsWith("scrypt$16384$8$5$")).toBe(true);
    expect(needsRehash(hash)).toBe(false);
    expect(await verifyPassword("correct horse", hash)).toBe(true);
  });

  it("hashes stored with the old p=1 default still verify and ask for a rehash", async () => {
    const salt = randomBytes(32).toString("hex");
    const key = scryptSync("pw", salt, 64, { N: 16384, r: 8, p: 1 }).toString("hex");
    const old = `scrypt$16384$8$1$${salt}$${key}`;
    expect(await verifyPassword("pw", old)).toBe(true);
    expect(needsRehash(old)).toBe(true);
  });

  it("the param-less legacy format keeps its fixed p=1", async () => {
    const salt = randomBytes(32).toString("hex");
    const key = scryptSync("pw", salt, 64, { N: 16384, r: 8, p: 1 }).toString("hex");
    expect(await verifyPassword("pw", `scrypt${salt}$${key}`)).toBe(true);
  });
});
