import { describe, it, expect, vi, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import {
  createTokenPair,
  verifyAccessToken,
  verifyRefreshToken,
  refreshAccessToken,
  createMemoryTokenRevocationStore,
  AuthConfigurationError,
  jwt,
  isTokenExpired,
  extractUserId,
  parseBearerToken,
  type TokenConfig,
  type TokenId,
} from "../src/index.js";
import { toUserId } from "../src/index.js";

const CONFIG: TokenConfig = {
  accessSecret: "test-access-secret-key-for-testing-32chars!",
  refreshSecret: "test-refresh-secret-key-for-testing-32ch!",
  accessTtl: 900,
  refreshTtl: 604_800,
  issuer: "zudojs-test",
  audience: "zudojs-test-client",
};

/** Sign an arbitrary payload with a real secret — a "trusted issuer" token. */
function sign(payload: unknown, secret: string): string {
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret)
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${sig}`;
}

afterEach(() => {
  vi.useRealTimers();
});

// AUTH-04 — an empty or short secret silently yields forgeable tokens.
describe("signing secret validation", () => {
  const cases: ReadonlyArray<[string, unknown]> = [
    ["empty string", ""],
    ["one character", "x"],
    ["31 bytes (one short)", "a".repeat(31)],
    ["undefined", undefined],
    ["not a string", 12345],
  ];

  for (const [label, secret] of cases) {
    it(`rejects an accessSecret that is ${label}`, () => {
      const config = { ...CONFIG, accessSecret: secret } as TokenConfig;
      expect(() => createTokenPair(toUserId("user-1"), config)).toThrow(
        AuthConfigurationError,
      );
    });

    it(`rejects a refreshSecret that is ${label}`, () => {
      const config = { ...CONFIG, refreshSecret: secret } as TokenConfig;
      expect(() => createTokenPair(toUserId("user-1"), config)).toThrow(
        AuthConfigurationError,
      );
    });
  }

  it("accepts exactly 32 bytes", () => {
    const config: TokenConfig = {
      accessSecret: "a".repeat(32),
      refreshSecret: "b".repeat(32),
    };
    expect(() => createTokenPair(toUserId("user-1"), config)).not.toThrow();
  });

  it("rejects reusing one secret for both token types", () => {
    const shared = "s".repeat(40);
    const config: TokenConfig = {
      accessSecret: shared,
      refreshSecret: shared,
    };
    expect(() => createTokenPair(toUserId("user-1"), config)).toThrow(
      AuthConfigurationError,
    );
  });

  it("also validates on the verification path", () => {
    const tokens = createTokenPair(toUserId("user-1"), CONFIG);
    expect(() =>
      verifyAccessToken(tokens.accessToken, {
        ...CONFIG,
        accessSecret: "",
      } as TokenConfig),
    ).toThrow(AuthConfigurationError);
    expect(() =>
      verifyRefreshToken(tokens.refreshToken, {
        ...CONFIG,
        refreshSecret: "",
      } as TokenConfig),
    ).toThrow(AuthConfigurationError);
  });

  it("rejects an out-of-range clock tolerance", () => {
    expect(() =>
      createTokenPair(toUserId("user-1"), {
        ...CONFIG,
        clockToleranceSeconds: -1,
      }),
    ).toThrow(AuthConfigurationError);
    expect(() =>
      createTokenPair(toUserId("user-1"), {
        ...CONFIG,
        clockToleranceSeconds: 10_000,
      }),
    ).toThrow(AuthConfigurationError);
  });
});

// AUTH-07 — pre-auth resource exhaustion via an unbounded header/payload.
describe("token size bounds", () => {
  const huge = "A".repeat(9000);

  it("rejects an oversized token without decoding it", () => {
    const start = Date.now();
    const result = verifyAccessToken(`${huge}.${huge}.${huge}`, CONFIG);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Invalid token format");
    expect(Date.now() - start).toBeLessThan(200);
  });

  it("rejects an oversized JOSE header segment", () => {
    const bigHeader = Buffer.from(
      JSON.stringify({ alg: "HS256", typ: "JWT", pad: "p".repeat(2000) }),
    ).toString("base64url");
    const result = verifyAccessToken(`${bigHeader}.body.sig`, CONFIG);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Invalid token format");
  });

  it("reports an oversized token as expired / anonymous in the unverified helpers", () => {
    const oversized = `${huge}.${huge}.${huge}`;
    expect(isTokenExpired(oversized)).toBe(true);
    expect(extractUserId(oversized)).toBeNull();
  });

  it("rejects an oversized Authorization header", () => {
    expect(parseBearerToken(`Bearer ${"A".repeat(9000)}`)).toBeNull();
  });

  it("rejects empty segments", () => {
    expect(verifyAccessToken("..", CONFIG).valid).toBe(false);
    expect(verifyAccessToken("", CONFIG).valid).toBe(false);
  });
});

// AUTH-13 — a validly-signed `null` payload used to throw a raw TypeError.
describe("payload shape validation", () => {
  const malformed: ReadonlyArray<[string, unknown]> = [
    ["null", null],
    ["an array", []],
    ["a string", "hello"],
    ["a number", 7],
    ["a payload with no sub", { jti: "a", typ: "access", exp: 1, iat: 1 }],
    ["a non-string sub", { sub: 1, jti: "a", typ: "access", exp: 9e9, iat: 1 }],
    ["a non-string jti", { sub: "u", jti: 1, typ: "access", exp: 9e9, iat: 1 }],
    ["an unknown typ", { sub: "u", jti: "a", typ: "id", exp: 9e9, iat: 1 }],
    ["a missing exp", { sub: "u", jti: "a", typ: "access", iat: 1 }],
    [
      "a non-numeric exp",
      { sub: "u", jti: "a", typ: "access", exp: "x", iat: 1 },
    ],
    ["a missing iat", { sub: "u", jti: "a", typ: "access", exp: 9e9 }],
    [
      "non-string roles",
      { sub: "u", jti: "a", typ: "access", exp: 9e9, iat: 1, roles: [1, 2] },
    ],
  ];

  for (const [label, payload] of malformed) {
    it(`returns {valid:false} rather than throwing for ${label}`, () => {
      const token = sign(payload, CONFIG.accessSecret);
      let result;
      expect(() => {
        result = verifyAccessToken(token, CONFIG);
      }).not.toThrow();
      expect(result!.valid).toBe(false);
    });
  }
});

// AUTH-23 — nbf/iat were never checked and there was no skew allowance.
describe("temporal claims", () => {
  const now = () => Math.floor(Date.now() / 1000);

  it("rejects an expired token", () => {
    const tokens = createTokenPair(toUserId("user-1"), {
      ...CONFIG,
      accessTtl: -10,
    });
    const result = verifyAccessToken(tokens.accessToken, CONFIG);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Token expired");
  });

  it("rejects an expired refresh token", () => {
    const tokens = createTokenPair(toUserId("user-1"), {
      ...CONFIG,
      refreshTtl: -10,
    });
    const result = verifyRefreshToken(tokens.refreshToken, CONFIG);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Token expired");
  });

  it("honours nbf", () => {
    const token = sign(
      {
        sub: "user-1",
        jti: "j1",
        typ: "access",
        iat: now(),
        exp: now() + 900,
        nbf: now() + 600,
        iss: CONFIG.issuer,
        aud: CONFIG.audience,
      },
      CONFIG.accessSecret,
    );
    const result = verifyAccessToken(token, CONFIG);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Token not yet valid");
  });

  it("accepts a token whose nbf has passed", () => {
    const token = sign(
      {
        sub: "user-1",
        jti: "j1",
        typ: "access",
        iat: now() - 100,
        exp: now() + 900,
        nbf: now() - 50,
        iss: CONFIG.issuer,
        aud: CONFIG.audience,
      },
      CONFIG.accessSecret,
    );
    expect(verifyAccessToken(token, CONFIG).valid).toBe(true);
  });

  it("rejects a forward-dated iat", () => {
    const token = sign(
      {
        sub: "user-1",
        jti: "j1",
        typ: "access",
        iat: now() + 86_400,
        exp: now() + 90_000,
        iss: CONFIG.issuer,
        aud: CONFIG.audience,
      },
      CONFIG.accessSecret,
    );
    const result = verifyAccessToken(token, CONFIG);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Token issued in the future");
  });

  it("applies clockToleranceSeconds to exp and iat", () => {
    const skewed: TokenConfig = { ...CONFIG, clockToleranceSeconds: 30 };
    const justExpired = sign(
      {
        sub: "user-1",
        jti: "j1",
        typ: "access",
        iat: now() - 100,
        exp: now() - 5,
        iss: CONFIG.issuer,
        aud: CONFIG.audience,
      },
      CONFIG.accessSecret,
    );
    expect(verifyAccessToken(justExpired, CONFIG).valid).toBe(false);
    expect(verifyAccessToken(justExpired, skewed).valid).toBe(true);

    const slightlyFuture = sign(
      {
        sub: "user-1",
        jti: "j1",
        typ: "access",
        iat: now() + 5,
        exp: now() + 900,
        iss: CONFIG.issuer,
        aud: CONFIG.audience,
      },
      CONFIG.accessSecret,
    );
    expect(verifyAccessToken(slightlyFuture, CONFIG).valid).toBe(false);
    expect(verifyAccessToken(slightlyFuture, skewed).valid).toBe(true);
  });
});

// AUTH-28 — the issuer branch was untested.
describe("issuer", () => {
  it("rejects a mismatched issuer", () => {
    const tokens = createTokenPair(toUserId("user-1"), CONFIG);
    const result = verifyAccessToken(tokens.accessToken, {
      ...CONFIG,
      issuer: "someone-else",
    });
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Invalid issuer");
  });

  it("accepts a matching issuer", () => {
    const tokens = createTokenPair(toUserId("user-1"), CONFIG);
    expect(verifyAccessToken(tokens.accessToken, CONFIG).valid).toBe(true);
  });
});

// AUTH-05/AUTH-11 — revocation store semantics.
describe("memory token revocation store", () => {
  const JTI = "jti-1" as TokenId;

  it("round-trips revoke/isRevoked", async () => {
    const store = createMemoryTokenRevocationStore();
    const exp = Math.floor(Date.now() / 1000) + 60;
    expect(await store.isRevoked(JTI)).toBe(false);
    await store.revoke(JTI, exp);
    expect(await store.isRevoked(JTI)).toBe(true);
  });

  it("forgets entries once the token would have expired anyway", async () => {
    const store = createMemoryTokenRevocationStore({ purgeIntervalMs: 0 });
    await store.revoke(JTI, Math.floor(Date.now() / 1000) - 1);
    expect(await store.isRevoked(JTI)).toBe(false);
  });

  it("revokeIfNotRevoked is a compare-and-set", async () => {
    const store = createMemoryTokenRevocationStore();
    const exp = Math.floor(Date.now() / 1000) + 60;
    expect(await store.revokeIfNotRevoked!(JTI, exp)).toBe(true);
    expect(await store.revokeIfNotRevoked!(JTI, exp)).toBe(false);
    expect(await store.isRevoked(JTI)).toBe(true);
  });

  it("lets exactly one of many concurrent claimants win", async () => {
    const store = createMemoryTokenRevocationStore();
    const exp = Math.floor(Date.now() / 1000) + 60;
    const results = await Promise.all(
      Array.from({ length: 20 }, () => store.revokeIfNotRevoked!(JTI, exp)),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
  });
});

// AUTH-22 — the jwt namespace omitted the revocation store.
describe("jwt namespace", () => {
  it("exposes the documented JWT surface", () => {
    expect(Object.keys(jwt).sort()).toEqual(
      [
        "createMemoryTokenRevocationStore",
        "createTokenPair",
        "extractUserId",
        "isTokenExpired",
        "parseBearerToken",
        "refreshAccessToken",
        "verifyAccessToken",
        "verifyRefreshToken",
      ].sort(),
    );
  });

  it("mints and verifies through the namespace", () => {
    const tokens = jwt.createTokenPair(toUserId("user-1"), CONFIG, {
      roles: ["a"],
    });
    expect(jwt.verifyAccessToken(tokens.accessToken, CONFIG).valid).toBe(true);
    expect(jwt.extractUserId(tokens.accessToken)).toBe("user-1");
    expect(jwt.isTokenExpired(tokens.accessToken)).toBe(false);
  });

  it("refreshAccessToken performs no revocation check", () => {
    const tokens = jwt.createTokenPair(toUserId("user-1"), CONFIG);
    expect(refreshAccessToken(tokens.refreshToken, CONFIG)).not.toBeNull();
    // Documented: replayable. Asserted so the doc claim stays honest.
    expect(refreshAccessToken(tokens.refreshToken, CONFIG)).not.toBeNull();
  });
});
