/**
 * Audit round 9 regressions for @zudojs/auth.
 *
 * One describe block per finding id.
 */

import { describe, it, expect } from "vitest";
import { createPermissionEngine } from "@zudojs/permissions";

import {
  AccountLockedError,
  AuthConfigurationError,
  AuthRateLimitError,
  InvalidCredentialsError,
  createAuthService,
  createMemoryLoginAttemptStore,
  createMemorySessionStore,
  createMemoryTokenRevocationStore,
  createTokenPair,
  hashPassword,
  toUserId,
  verifyAccessToken,
  verifyPassword,
  type AuthUser,
  type TokenConfig,
} from "../src/index.js";

const TOKEN: TokenConfig = {
  accessSecret: "access-secret-that-is-at-least-32-bytes-long",
  refreshSecret: "refresh-secret-that-is-at-least-32-bytes-long",
};

const alice: AuthUser = {
  id: toUserId("user-alice"),
  email: "alice@example.com",
  roles: ["editor"],
  active: true,
  createdAt: new Date(),
};

describe("AUTH-R9-01 session lifetimes must be finite and positive", () => {
  it("rejects a NaN idle TTL instead of creating a session that never expires", async () => {
    const store = createMemorySessionStore();

    await expect(
      store.create({ userId: alice.id, ttlSeconds: Number("unset") }),
    ).rejects.toBeInstanceOf(AuthConfigurationError);
  });

  it.each([0, -1, Number.POSITIVE_INFINITY, Number.NaN])(
    "rejects an idle TTL of %s",
    async (ttlSeconds) => {
      const store = createMemorySessionStore();
      await expect(
        store.create({ userId: alice.id, ttlSeconds }),
      ).rejects.toBeInstanceOf(AuthConfigurationError);
    },
  );

  it("rejects a NaN absolute TTL", async () => {
    const store = createMemorySessionStore();

    await expect(
      store.create({
        userId: alice.id,
        ttlSeconds: 60,
        absoluteTtlSeconds: Number.NaN,
      }),
    ).rejects.toBeInstanceOf(AuthConfigurationError);
  });

  it("still creates sessions with valid lifetimes and honours the default", async () => {
    const store = createMemorySessionStore();
    const withTtl = await store.create({ userId: alice.id, ttlSeconds: 1 });
    const withDefault = await store.create({ userId: alice.id });

    expect(withTtl.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(Number.isNaN(withDefault.expiresAt.getTime())).toBe(false);
  });

  it("createAuthService rejects a NaN sessionTtlSeconds at construction", () => {
    expect(() =>
      createAuthService({
        token: TOKEN,
        sessionStore: createMemorySessionStore(),
        sessionTtlSeconds: Number(process.env["ZUDO_R9_UNSET_TTL"]),
        findUser: async () => alice,
        findUserById: async () => alice,
        verifyPassword: async () => true,
      }),
    ).toThrow(AuthConfigurationError);
  });

  it("createAuthService rejects a non-positive absoluteSessionTtlSeconds", () => {
    expect(() =>
      createAuthService({
        token: TOKEN,
        sessionStore: createMemorySessionStore(),
        sessionTtlSeconds: 60,
        absoluteSessionTtlSeconds: 0,
        findUser: async () => alice,
        findUserById: async () => alice,
        verifyPassword: async () => true,
      }),
    ).toThrow(AuthConfigurationError);
  });
});

describe("AUTH-R9-02 token TTLs and secrets are validated up front", () => {
  it("rejects a NaN accessTtl instead of minting an unverifiable token", () => {
    const config = { ...TOKEN, accessTtl: Number("unset") };

    // Previously: minted a token whose exp serialised as null, and
    // verifyAccessToken then reported "Invalid payload".
    expect(() => createTokenPair(alice.id, config)).toThrow(
      AuthConfigurationError,
    );
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rejects a refreshTtl of %s",
    (refreshTtl) => {
      expect(() => createTokenPair(alice.id, { ...TOKEN, refreshTtl })).toThrow(
        AuthConfigurationError,
      );
    },
  );

  it("still accepts a negative TTL, which mints an already-expired token", () => {
    const config = { ...TOKEN, accessTtl: -10 };
    const pair = createTokenPair(alice.id, config);

    expect(verifyAccessToken(pair.accessToken, config)).toMatchObject({
      valid: false,
      error: "Token expired",
    });
  });

  it("still mints and verifies with a valid explicit TTL", () => {
    const config = { ...TOKEN, accessTtl: 60, refreshTtl: 120 };
    const pair = createTokenPair(alice.id, config);

    expect(verifyAccessToken(pair.accessToken, config).valid).toBe(true);
    expect(pair.expiresIn).toBe(60);
  });

  it("createAuthService rejects bad secrets at construction rather than at first login", () => {
    expect(() =>
      createAuthService({
        token: { accessSecret: "short", refreshSecret: "short" },
        sessionStore: createMemorySessionStore(),
        sessionTtlSeconds: 60,
        findUser: async () => alice,
        findUserById: async () => alice,
        verifyPassword: async () => true,
      }),
    ).toThrow(AuthConfigurationError);
  });
});

describe("AUTH-R9-03 login throttling is keyed by the normalised identifier", () => {
  async function service(maxFailedAttempts: number, maxAttemptsPerWindow = 100) {
    const hash = await hashPassword("correct horse battery");
    const lookups: string[] = [];

    const auth = createAuthService({
      token: TOKEN,
      sessionStore: createMemorySessionStore(),
      sessionTtlSeconds: 60,
      findUser: async (identifier) => {
        lookups.push(identifier);
        return identifier.trim().toLowerCase() === alice.email ? alice : null;
      },
      findUserById: async () => alice,
      verifyPassword: async (_id, password) => verifyPassword(password, hash),
      loginThrottle: {
        store: createMemoryLoginAttemptStore(),
        maxFailedAttempts,
        maxAttemptsPerWindow,
        lockoutSeconds: 900,
      },
    });

    return { auth, lookups };
  }

  it("locks case, whitespace and Unicode variants of the identifier together", async () => {
    const { auth, lookups } = await service(2);

    for (const identifier of ["alice@example.com", "Alice@Example.com"]) {
      await expect(
        auth.login({ identifier, password: "wrong" }),
      ).rejects.toBeInstanceOf(InvalidCredentialsError);
    }

    lookups.length = 0;

    // Previously each variant had its own budget and reached findUser.
    for (const identifier of [
      "ALICE@EXAMPLE.COM",
      "  alice@example.com ",
      "ａlice@example.com", // fullwidth "a", NFKC-folds to "a"
    ]) {
      await expect(
        auth.login({ identifier, password: "correct horse battery" }),
      ).rejects.toBeInstanceOf(AccountLockedError);
    }

    expect(lookups).toEqual([]);
  });

  it("rate-limits the variants as one identifier", async () => {
    const { auth } = await service(100, 2);

    await auth.login({ identifier: "bob@example.com", password: "x" }).catch(() => {});
    await auth.login({ identifier: "BOB@example.com", password: "x" }).catch(() => {});

    await expect(
      auth.login({ identifier: " Bob@Example.com", password: "x" }),
    ).rejects.toBeInstanceOf(AuthRateLimitError);
  });

  it("a successful login clears the shared counter", async () => {
    const { auth } = await service(3);

    await auth.login({ identifier: "Alice@example.com", password: "wrong" }).catch(() => {});
    await auth.login({ identifier: "ALICE@example.com", password: "wrong" }).catch(() => {});

    await expect(
      auth.login({ identifier: "alice@example.com", password: "correct horse battery" }),
    ).resolves.toMatchObject({ user: { id: alice.id } });

    await auth.login({ identifier: "alice@example.com", password: "wrong" }).catch(() => {});
    await auth.login({ identifier: "alice@example.com", password: "wrong" }).catch(() => {});
    await expect(
      auth.login({ identifier: "alice@example.com", password: "wrong" }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });
});

describe("README Quick Start", () => {
  it("runs the documented service configuration end to end", async () => {
    const hash = await hashPassword("correct horse battery");

    const auth = createAuthService({
      token: {
        ...TOKEN,
        accessTtl: 900,
        refreshTtl: 604_800,
        issuer: "my-api",
        audience: "my-app",
        clockToleranceSeconds: 5,
      },
      sessionStore: createMemorySessionStore(),
      sessionTtlSeconds: 86_400,
      absoluteSessionTtlSeconds: 7 * 86_400,
      findUser: async (identifier) => (identifier === alice.email ? alice : null),
      findUserById: async (id) => (id === alice.id ? alice : null),
      verifyPassword: async (_userId, password) => verifyPassword(password, hash),
      revocationStore: createMemoryTokenRevocationStore(),
      loginThrottle: {
        store: createMemoryLoginAttemptStore({ windowSeconds: 60 }),
        maxFailedAttempts: 5,
        lockoutSeconds: 900,
        maxAttemptsPerWindow: 20,
      },
      permissions: createPermissionEngine({
        roles: [{ name: "admin", permissions: ["*:*"] }],
      }),
    });

    const { user, tokens, sessionId } = await auth.login(
      { identifier: "alice@example.com", password: "correct horse battery" },
      { userAgent: "vitest", ip: "127.0.0.1" },
    );

    const payload = await auth.verifyToken(tokens.accessToken);
    expect(payload.sub).toBe(user.id);

    const rotated = await auth.refresh(tokens.refreshToken);
    expect(rotated.accessToken).not.toBe(tokens.accessToken);

    const decision = await auth.checkAccess({
      userId: user.id,
      roles: user.roles,
      permission: "billing:refund",
      resourceOwnerId: "someone-else",
    });
    expect(decision.allowed).toBe(false);

    await auth.logout(sessionId, rotated.refreshToken);
    await expect(auth.verifyToken(rotated.accessToken)).rejects.toThrow();
    await auth.logoutAll(user.id);
  });
});
