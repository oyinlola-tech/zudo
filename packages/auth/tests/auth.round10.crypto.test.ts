/**
 * Audit round 10 phase 2 regressions for @zudojs/auth: password hashing
 * delegated to @zudojs/crypto (XPKG-01) and the shared AuthError (CONV-02).
 */

import { describe, it, expect } from "vitest";
import {
  hashPassword as cryptoHashPassword,
  verifyPassword as cryptoVerifyPassword,
  decodePasswordHash,
} from "@zudojs/crypto";
import { AuthError as SharedAuthError, ErrorCode } from "@zudojs/errors";

import {
  AuthError,
  InvalidCredentialsError,
  hashPassword,
  needsRehash,
  verifyPassword,
} from "../src/index.js";

/** Produced by the pre-delegation auth code (HEAD 4cc6e0a9 dist). */
const HEAD_HASHES = [
  [
    "correct horse battery staple",
    "scrypt$16384$8$5$2e09cc356e30e343b07016f93e4b5104b36bdcc15d8c6cf30420e9f1ebaf4b1a$270451b590b1e2f1ea71d651891fcf7f040e1d123d1aee138c7ec84e6b38ab22023b65a67744bf2707f73ddc51fe4848e230a8365eb2920489d060b564cc7891",
  ],
  [
    "pässwörd-ünicode",
    "scrypt$16384$8$5$fe446358a3c2db341633e5616f8917aa6586ca75b95168f133926d67465b415c$4c56d741e768c1da277e0ffec3814cdd400dfc26b7dfccad462dd043362f05d6c253f8161555adb24751852809852e7603db4792ac541476550f10a8c6388ab7",
  ],
  [
    "legacy-p1-password",
    "scrypt$16384$8$1$00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff$674a21ecf14557441b46d803065eb28ce5ea4eee3c7d7019fcb041572f1094adc674ecc1576129aae89cadaf4666b526aba914f36b424a943c844313f3e9bbb7",
  ],
  [
    "paramless-password",
    "scrypt00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff$22d8a4a24315c00cab4b94a998973a04714379c907e4eb21dc6f4b6534b1d2a4cfb918fda7c127f965b6b0d0202aa79101cdc7ac7cb2ccf1d9ceea189951d2bd",
  ],
] as const;

describe("security/XPKG-01 (phase 2): hashing delegates to @zudojs/crypto", () => {
  it("writes a crypto-format hash that @zudojs/crypto itself verifies", async () => {
    const hash = await hashPassword("delegated-pw");
    const decoded = decodePasswordHash(hash);
    expect(decoded.algorithm).toBe("scrypt");
    expect(decoded.salt.byteLength).toBe(32);
    expect(decoded.hash.byteLength).toBe(64);
    expect(await cryptoVerifyPassword("delegated-pw", hash)).toBe(true);
    expect(needsRehash(hash)).toBe(false);
  });

  it("verifies a hash minted directly by @zudojs/crypto", async () => {
    const { encoded } = await cryptoHashPassword("from-crypto");
    expect(await verifyPassword("from-crypto", encoded)).toBe(true);
    expect(await verifyPassword("nope", encoded)).toBe(false);
  });

  for (const [password, stored] of HEAD_HASHES) {
    it(`still verifies a stored pre-delegation hash (${stored.slice(0, 17)}…)`, async () => {
      expect(await verifyPassword(password, stored)).toBe(true);
      expect(await verifyPassword(`${password}x`, stored)).toBe(false);
      expect(needsRehash(stored)).toBe(true);
    });
  }

  it("flags every non-current hash for rehash", async () => {
    const weakerParams = await cryptoHashPassword("pw", { parallelization: 1 });
    expect(needsRehash(weakerParams.encoded)).toBe(true);
    const mixedLengths = await cryptoHashPassword("pw", {
      saltBytes: 16,
      keyBytes: 64,
    });
    expect(needsRehash(mixedLengths.encoded)).toBe(true);
    const pbkdf2 =
      "v1$pbkdf2-sha256$600000$AAAAAAAAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    expect(needsRehash(pbkdf2)).toBe(true);
    expect(needsRehash("")).toBe(true);
    expect(needsRehash("garbage")).toBe(true);
  });

  it("rejects an empty password with an INVALID_INPUT AuthError", async () => {
    await expect(hashPassword("")).rejects.toMatchObject({
      code: ErrorCode.INVALID_INPUT,
      statusCode: 400,
    });
  });
});

describe("edge/CONV-02 (auth): AuthError is the @zudojs/errors class", () => {
  it("re-exports the shared class, subclasses included", () => {
    expect(AuthError).toBe(SharedAuthError);
    const err = new InvalidCredentialsError();
    expect(err).toBeInstanceOf(SharedAuthError);
    expect(err.statusCode).toBe(401);
    expect(err.expose).toBe(true);
  });
});
