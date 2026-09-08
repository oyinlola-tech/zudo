import { describe, it, expect } from "vitest";
import {
  // Password
  hashPassword,
  verifyPassword,
  needsRehash,
  generateRandomToken,

  // Token
  createTokenPair,
  verifyAccessToken,
  verifyRefreshToken,
  refreshAccessToken,

  // Session
  createMemorySessionStore,

  // Revocation
  createMemoryTokenRevocationStore,

  // Provider
  createAuthService,
  type AuthUser,
  type TokenConfig,
  TokenRevokedError,
  TokenInvalidError,
} from "../src/index.js";
import { scryptSync, createHmac } from "node:crypto";

import {
  createPermissionEngine,
  createRoleRegistry,
  type PermissionEngine,
} from "@zudojs/permissions";

const TEST_TOKEN_CONFIG: TokenConfig = {
  accessSecret: "test-access-secret-key-for-testing-32chars!",
  refreshSecret: "test-refresh-secret-key-for-testing-32ch!",
  accessTtl: 900,
  refreshTtl: 604_800,
  issuer: "zudojs-test",
  audience: "zudojs-test-client",
};

const TEST_USER: AuthUser = {
  id: "user-123",
  email: "alice@example.com",
  name: "Alice",
  roles: ["admin", "editor"],
  active: true,
  createdAt: new Date("2024-01-01"),
};

// ─── Password ─────────────────────────────────────────────────────────────

describe("Password Hashing", () => {
  it("should hash a password", async () => {
    const hash = await hashPassword("my-password");
    expect(hash).toContain("scrypt");
    expect(hash).not.toBe("my-password");
  });

  it("should verify a correct password", async () => {
    const hash = await hashPassword("correct-password");
    expect(await verifyPassword("correct-password", hash)).toBe(true);
  });

  it("should reject an incorrect password", async () => {
    const hash = await hashPassword("correct-password");
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("should generate different hashes for the same password", async () => {
    const hash1 = await hashPassword("same-password");
    const hash2 = await hashPassword("same-password");
    expect(hash1).not.toBe(hash2);
  });

  it("needsRehash should detect old format", () => {
    expect(needsRehash("invalid-format")).toBe(true);
    expect(needsRehash("scrypt$a$hash")).toBe(true);
  });

  it("should produce the documented scrypt$N$r$p$salt$hash format", async () => {
    const hash = await hashPassword("my-password");
    const parts = hash.split("$");
    expect(parts).toHaveLength(6);
    expect(parts[0]).toBe("scrypt");
    expect(Number(parts[1])).toBe(16384);
    expect(needsRehash(hash)).toBe(false);
  });

  it("should verify legacy-format hashes (≤ 0.1.1) and flag them for rehash", async () => {
    // Legacy format: "scrypt<salt>$<hash>" with default params
    const salt = "ab".repeat(32);
    const key = scryptSync("legacy-password", salt, 64, {
      N: 16384,
      r: 8,
      p: 1,
    }).toString("hex");
    const legacyHash = `scrypt${salt}$${key}`;

    expect(await verifyPassword("legacy-password", legacyHash)).toBe(true);
    expect(await verifyPassword("wrong-password", legacyHash)).toBe(false);
    expect(needsRehash(legacyHash)).toBe(true);
  });

  it("should generate random tokens", () => {
    const token1 = generateRandomToken();
    const token2 = generateRandomToken();
    expect(token1).not.toBe(token2);
    expect(token1.length).toBe(64);
  });
});

// ─── Token ─────────────────────────────────────────────────────────────────

describe("JWT Tokens", () => {
  it("should create a token pair", () => {
    const tokens = createTokenPair("user-123", TEST_TOKEN_CONFIG);
    expect(tokens.accessToken).toBeTruthy();
    expect(tokens.refreshToken).toBeTruthy();
    expect(tokens.tokenType).toBe("Bearer");
    expect(tokens.expiresIn).toBe(900);
  });

  it("should verify a valid access token", () => {
    const tokens = createTokenPair("user-123", TEST_TOKEN_CONFIG, {
      roles: ["admin"],
    });
    const result = verifyAccessToken(tokens.accessToken, TEST_TOKEN_CONFIG);
    expect(result.valid).toBe(true);
    expect(result.payload?.sub).toBe("user-123");
    expect(result.payload?.typ).toBe("access");
    expect(result.payload?.roles).toEqual(["admin"]);
  });

  it("should verify a valid refresh token", () => {
    const tokens = createTokenPair("user-123", TEST_TOKEN_CONFIG);
    const result = verifyRefreshToken(tokens.refreshToken, TEST_TOKEN_CONFIG);
    expect(result.valid).toBe(true);
    expect(result.payload?.sub).toBe("user-123");
    expect(result.payload?.typ).toBe("refresh");
  });

  it("should reject an access token used as refresh token", () => {
    const tokens = createTokenPair("user-123", TEST_TOKEN_CONFIG);
    const result = verifyRefreshToken(tokens.accessToken, TEST_TOKEN_CONFIG);
    expect(result.valid).toBe(false);
  });

  it("should reject a tampered token", () => {
    const tokens = createTokenPair("user-123", TEST_TOKEN_CONFIG);
    const tampered = tokens.accessToken.slice(0, -5) + "XXXXX";
    const result = verifyAccessToken(tampered, TEST_TOKEN_CONFIG);
    expect(result.valid).toBe(false);
  });

  it("should reject a token signed with the wrong secret", () => {
    const tokens = createTokenPair("user-123", TEST_TOKEN_CONFIG);
    const wrongConfig: TokenConfig = {
      ...TEST_TOKEN_CONFIG,
      accessSecret: "wrong-secret-key-32-chars-long!!!!",
    };
    const result = verifyAccessToken(tokens.accessToken, wrongConfig);
    expect(result.valid).toBe(false);
  });

  it("should refresh an access token", () => {
    const tokens = createTokenPair("user-123", TEST_TOKEN_CONFIG, {
      roles: ["user"],
    });
    const newTokens = refreshAccessToken(
      tokens.refreshToken,
      TEST_TOKEN_CONFIG,
      { roles: ["user"] },
    );
    expect(newTokens).not.toBeNull();
    expect(newTokens!.accessToken).not.toBe(tokens.accessToken);
  });

  it("should reject refresh with an invalid refresh token", () => {
    const result = refreshAccessToken("invalid-token", TEST_TOKEN_CONFIG);
    expect(result).toBeNull();
  });

  it("should honor TTLs in seconds (default 15 min / 7 days)", () => {
    const config: TokenConfig = {
      accessSecret: TEST_TOKEN_CONFIG.accessSecret,
      refreshSecret: TEST_TOKEN_CONFIG.refreshSecret,
    };
    const tokens = createTokenPair("user-123", config);
    const access = decodePayload(tokens.accessToken);
    const refresh = decodePayload(tokens.refreshToken);
    expect(access.exp - access.iat).toBe(900);
    expect(refresh.exp - refresh.iat).toBe(604_800);
    expect(tokens.expiresIn).toBe(900);
  });

  it("should carry roles through a refresh without re-supplying them", () => {
    const tokens = createTokenPair("user-123", TEST_TOKEN_CONFIG, {
      roles: ["editor"],
    });
    const newTokens = refreshAccessToken(tokens.refreshToken, TEST_TOKEN_CONFIG);
    expect(newTokens).not.toBeNull();
    const result = verifyAccessToken(newTokens!.accessToken, TEST_TOKEN_CONFIG);
    expect(result.valid).toBe(true);
    expect(result.payload?.roles).toEqual(["editor"]);
  });

  it("should reject a token with a mismatched audience", () => {
    const tokens = createTokenPair("user-123", TEST_TOKEN_CONFIG);
    const otherAudience: TokenConfig = {
      ...TEST_TOKEN_CONFIG,
      audience: "some-other-client",
    };
    const result = verifyAccessToken(tokens.accessToken, otherAudience);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Invalid audience");
  });

  it("should reject a token without an exp claim", () => {
    // Forge an unsigned-exp token by re-signing a payload missing exp
    const header = Buffer.from(
      JSON.stringify({ alg: "HS256", typ: "JWT" }),
    ).toString("base64url");
    const body = Buffer.from(
      JSON.stringify({ sub: "user-123", typ: "access", iat: 1 }),
    ).toString("base64url");
    const sig = createHmac("sha256", TEST_TOKEN_CONFIG.accessSecret)
      .update(`${header}.${body}`)
      .digest("base64url");
    const result = verifyAccessToken(
      `${header}.${body}.${sig}`,
      TEST_TOKEN_CONFIG,
    );
    expect(result.valid).toBe(false);
  });

  it("should reject a token whose header declares another algorithm", () => {
    const tokens = createTokenPair("user-123", TEST_TOKEN_CONFIG);
    const [, body, sig] = tokens.accessToken.split(".");
    const noneHeader = Buffer.from(
      JSON.stringify({ alg: "none", typ: "JWT" }),
    ).toString("base64url");
    const result = verifyAccessToken(
      `${noneHeader}.${body}.${sig}`,
      TEST_TOKEN_CONFIG,
    );
    expect(result.valid).toBe(false);
  });
});

function decodePayload(token: string): {
  iat: number;
  exp: number;
  roles?: string[];
} {
  return JSON.parse(
    Buffer.from(token.split(".")[1]!, "base64url").toString("utf-8"),
  );
}

// ─── Session ───────────────────────────────────────────────────────────────

describe("Session Management", () => {
  it("should create a session", async () => {
    const store = createMemorySessionStore();
    const session = await store.create({ userId: "user-123" });
    expect(session.id).toBeTruthy();
    expect(session.userId).toBe("user-123");
    expect(session.active).toBe(true);
  });

  it("should get a session by ID", async () => {
    const store = createMemorySessionStore();
    const created = await store.create({ userId: "user-123" });
    const retrieved = await store.get(created.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.userId).toBe("user-123");
  });

  it("should return null for non-existent session", async () => {
    const store = createMemorySessionStore();
    const retrieved = await store.get("non-existent");
    expect(retrieved).toBeNull();
  });

  it("should touch a session", async () => {
    const store = createMemorySessionStore();
    const session = await store.create({ userId: "user-123" });
    const before = session.lastActivityAt;
    await store.touch(session.id);
    const after = await store.get(session.id);
    expect(after!.lastActivityAt.getTime()).toBeGreaterThanOrEqual(
      before.getTime(),
    );
  });

  it("should destroy a session", async () => {
    const store = createMemorySessionStore();
    const session = await store.create({ userId: "user-123" });
    await store.destroy(session.id);
    const retrieved = await store.get(session.id);
    expect(retrieved).toBeNull();
  });

  it("should destroy all sessions for a user", async () => {
    const store = createMemorySessionStore();
    await store.create({ userId: "user-123" });
    await store.create({ userId: "user-123" });
    await store.create({ userId: "user-456" });
    await store.destroyAllForUser("user-123");
    expect(
      await store.get((await store.create({ userId: "user-123" })).id),
    ).not.toBeNull();
  });

  it("should extend expiration on touch (sliding expiration)", async () => {
    const store = createMemorySessionStore();
    const session = await store.create({ userId: "user-123", ttlSeconds: 60 });
    await new Promise((r) => setTimeout(r, 5));
    await store.touch(session.id);
    const touched = await store.get(session.id);
    expect(touched!.expiresAt.getTime()).toBeGreaterThan(
      session.expiresAt.getTime(),
    );
  });
});

// ─── Permissions Engine (via @zudojs/permissions) ──────────────────────────

describe("Permissions Engine", () => {
  const engine = createPermissionEngine({
    roles: [
      {
        name: "admin",
        permissions: ["users:read", "users:write", "posts:*", "*:*"],
      },
      { name: "viewer", permissions: ["users:read", "posts:read"] },
    ],
  });

  it("should check exact permissions", async () => {
    expect(
      await engine.can({ id: "u1", roles: ["viewer"] }, "users:read"),
    ).toBe(true);
    expect(
      await engine.can({ id: "u1", roles: ["viewer"] }, "users:write"),
    ).toBe(false);
  });

  it("should check wildcard permissions", async () => {
    expect(
      await engine.can({ id: "u1", roles: ["admin"] }, "posts:delete"),
    ).toBe(true);
    expect(
      await engine.can({ id: "u1", roles: ["admin"] }, "anything:here"),
    ).toBe(true);
  });

  it("should support ownership via policy", async () => {
    const engineWithPolicy = createPermissionEngine({
      roles: [{ name: "viewer", permissions: ["posts:read"] }],
      policies: [
        {
          name: "owner",
          permissions: ["posts:write"],
          evaluate: (ctx) => ({
            allowed:
              ctx.actor.id ===
              (ctx.resource as Record<string, unknown>)?.ownerId,
          }),
        },
      ],
    });

    const result = await engineWithPolicy.check(
      { id: "user-123", roles: ["viewer"] },
      "posts:write",
      { ownerId: "user-123" },
    );
    expect(result.allowed).toBe(true);
  });

  it("should deny without ownership", async () => {
    const engineWithPolicy = createPermissionEngine({
      roles: [{ name: "viewer", permissions: ["posts:read"] }],
      policies: [
        {
          name: "owner",
          permissions: ["posts:write"],
          evaluate: (ctx) => ({
            allowed:
              ctx.actor.id ===
              (ctx.resource as Record<string, unknown>)?.ownerId,
          }),
        },
      ],
    });

    const result = await engineWithPolicy.check(
      { id: "user-123", roles: ["viewer"] },
      "posts:write",
      { ownerId: "user-456" },
    );
    expect(result.allowed).toBe(false);
  });
});

// ─── Auth Service ──────────────────────────────────────────────────────────

describe("Auth Service", () => {
  const users = new Map<string, AuthUser & { passwordHash: string }>();

  function createEngine(): PermissionEngine {
    return createPermissionEngine({
      roles: [
        { name: "admin", permissions: ["users:read", "users:write"] },
        { name: "viewer", permissions: ["users:read"] },
      ],
    });
  }

  async function setup() {
    users.clear();
    const hash = await hashPassword("password123");
    users.set("alice@example.com", {
      ...TEST_USER,
      passwordHash: hash,
    });

    return createAuthService({
      token: TEST_TOKEN_CONFIG,
      sessionStore: createMemorySessionStore(),
      findUser: async (id) => users.get(id) ?? null,
      verifyPassword: async (userId, pwd) => {
        for (const user of users.values()) {
          if (user.id === userId) {
            return verifyPassword(pwd, user.passwordHash);
          }
        }
        return false;
      },
      permissions: createEngine(),
    });
  }

  it("should login with valid credentials", async () => {
    const auth = await setup();
    const result = await auth.login(
      { identifier: "alice@example.com", password: "password123" },
      { userAgent: "test-agent", ip: "127.0.0.1" },
    );
    expect(result.user.id).toBe("user-123");
    expect(result.tokens.accessToken).toBeTruthy();
    expect(result.sessionId).toBeTruthy();
  });

  it("should throw on invalid credentials", async () => {
    const auth = await setup();
    await expect(
      auth.login({ identifier: "alice@example.com", password: "wrong" }),
    ).rejects.toThrow();
  });

  it("should verify a token", async () => {
    const auth = await setup();
    const { tokens } = await auth.login({
      identifier: "alice@example.com",
      password: "password123",
    });
    const payload = auth.verifyToken(tokens.accessToken);
    expect(payload.sub).toBe("user-123");
  });

  it("should refresh tokens", async () => {
    const auth = await setup();
    const { tokens } = await auth.login({
      identifier: "alice@example.com",
      password: "password123",
    });
    const newTokens = await auth.refresh(tokens.refreshToken);
    expect(newTokens.accessToken).not.toBe(tokens.accessToken);
  });

  it("should logout and invalidate session", async () => {
    const auth = await setup();
    const { sessionId } = await auth.login({
      identifier: "alice@example.com",
      password: "password123",
    });
    await auth.logout(sessionId);
  });

  it("should carry roles into refreshed access tokens", async () => {
    const auth = await setup();
    const { tokens } = await auth.login({
      identifier: "alice@example.com",
      password: "password123",
    });
    const newTokens = await auth.refresh(tokens.refreshToken);
    const payload = auth.verifyToken(newTokens.accessToken);
    expect(payload.roles).toEqual(["admin", "editor"]);
  });

  it("should throw TokenInvalidError for malformed tokens", async () => {
    const auth = await setup();
    expect(() => auth.verifyToken("garbage")).toThrow(TokenInvalidError);
  });

  it("should rotate refresh tokens when a revocation store is configured", async () => {
    const users2 = new Map<string, AuthUser & { passwordHash: string }>();
    const hash = await hashPassword("password123");
    users2.set("alice@example.com", { ...TEST_USER, passwordHash: hash });

    const auth = createAuthService({
      token: TEST_TOKEN_CONFIG,
      sessionStore: createMemorySessionStore(),
      revocationStore: createMemoryTokenRevocationStore(),
      findUser: async (id) => users2.get(id) ?? null,
      verifyPassword: async () => true,
      sessionTtlSeconds: 3600,
    });

    const { tokens } = await auth.login({
      identifier: "alice@example.com",
      password: "password123",
    });

    // First refresh succeeds and revokes the used refresh token
    await auth.refresh(tokens.refreshToken);
    // Replaying the same refresh token is rejected
    await expect(auth.refresh(tokens.refreshToken)).rejects.toThrow(
      TokenRevokedError,
    );
  });

  it("should check access permissions via engine", async () => {
    const auth = await setup();
    const result = await auth.checkAccess("user-123", ["admin"], "users:write");
    expect(result.allowed).toBe(true);
  });

  it("should deny access via engine", async () => {
    const auth = await setup();
    const result = await auth.checkAccess(
      "user-123",
      ["viewer"],
      "users:write",
    );
    expect(result.allowed).toBe(false);
  });
});
