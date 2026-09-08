import { describe, it, expect } from "vitest";
import {
  createAuthService,
  createMemorySessionStore,
  createMemoryTokenRevocationStore,
  createMemoryLoginAttemptStore,
  hashPassword,
  verifyPassword,
  AccountDeactivatedError,
  AccountLockedError,
  AuthRateLimitError,
  AuthConfigurationError,
  InvalidCredentialsError,
  SessionExpiredError,
  TokenRevokedError,
  type AuthServiceConfig,
  type AuthUser,
  type TokenConfig,
  type TokenId,
} from "../src/index.js";
import { toUserId } from "../src/index.js";

const CONFIG: TokenConfig = {
  accessSecret: "test-access-secret-key-for-testing-32chars!",
  refreshSecret: "test-refresh-secret-key-for-testing-32ch!",
  accessTtl: 900,
  refreshTtl: 604_800,
};

const ALICE: AuthUser = {
  id: toUserId("user-alice"),
  email: "alice@example.com",
  name: "Alice",
  roles: ["admin"],
  active: true,
  createdAt: new Date("2024-01-01"),
};

interface Fixture {
  readonly auth: ReturnType<typeof createAuthService>;
  readonly users: Map<string, AuthUser>;
  readonly hashes: Map<string, string>;
}

async function fixture(
  overrides: Partial<AuthServiceConfig> = {},
  user: AuthUser = ALICE,
): Promise<Fixture> {
  const users = new Map<string, AuthUser>([[user.email, user]]);
  const hashes = new Map<string, string>([
    [user.id, await hashPassword("password123")],
  ]);

  const auth = createAuthService({
    token: CONFIG,
    sessionStore: createMemorySessionStore(),
    findUser: async (identifier) => users.get(identifier) ?? null,
    findUserById: async (id) => {
      for (const candidate of users.values()) {
        if (candidate.id === id) return candidate;
      }
      return null;
    },
    verifyPassword: async (userId, password) => {
      const hash = hashes.get(userId);
      return hash ? verifyPassword(password, hash) : false;
    },
    sessionTtlSeconds: 3600,
    ...overrides,
  });

  return { auth, users, hashes };
}

// AUTH-02 — login was an account-existence oracle.
describe("login does not disclose account existence", () => {
  it("throws the identical error for unknown user and wrong password", async () => {
    const { auth } = await fixture();

    const unknown = await auth
      .login({ identifier: "nobody@example.com", password: "password123" })
      .catch((error: unknown) => error);
    const wrongPassword = await auth
      .login({ identifier: "alice@example.com", password: "nope" })
      .catch((error: unknown) => error);

    expect(unknown).toBeInstanceOf(InvalidCredentialsError);
    expect(wrongPassword).toBeInstanceOf(InvalidCredentialsError);
    expect((unknown as Error).message).toBe((wrongPassword as Error).message);
    expect((unknown as InvalidCredentialsError).statusCode).toBe(
      (wrongPassword as InvalidCredentialsError).statusCode,
    );
  });

  it("does not reveal deactivation to a caller without the password", async () => {
    const { auth } = await fixture({}, { ...ALICE, active: false });
    // Wrong password against a deactivated account must look exactly like
    // any other failure — it used to throw AccountDeactivatedError before
    // the password was ever checked.
    await expect(
      auth.login({ identifier: "alice@example.com", password: "nope" }),
    ).rejects.toThrow(InvalidCredentialsError);
  });

  it("reports deactivation only once the password is proven", async () => {
    const { auth } = await fixture({}, { ...ALICE, active: false });
    await expect(
      auth.login({ identifier: "alice@example.com", password: "password123" }),
    ).rejects.toThrow(AccountDeactivatedError);
  });

  it("burns comparable work on the unknown-user path", async () => {
    const { auth } = await fixture();

    const time = async (identifier: string): Promise<number> => {
      const start = performance.now();
      await auth
        .login({ identifier, password: "password123" })
        .catch(() => undefined);
      return performance.now() - start;
    };

    // Warm up so the first scrypt call does not skew the comparison.
    await time("alice@example.com");

    const known = await time("alice@example.com");
    const unknown = await time("nobody@example.com");

    // The unknown-user path used to return before any hashing at all.
    expect(unknown).toBeGreaterThan(1);
    expect(unknown).toBeGreaterThan(known * 0.25);
  });
});

// AUTH-09 — lockout and rate limiting were advertised but never wired.
describe("login throttling", () => {
  it("locks an account after repeated failures", async () => {
    const { auth } = await fixture({
      loginThrottle: {
        store: createMemoryLoginAttemptStore(),
        maxFailedAttempts: 3,
        lockoutSeconds: 900,
      },
    });

    for (let i = 0; i < 3; i++) {
      await expect(
        auth.login({ identifier: "alice@example.com", password: "nope" }),
      ).rejects.toThrow(InvalidCredentialsError);
    }

    const locked = await auth
      .login({ identifier: "alice@example.com", password: "nope" })
      .catch((error: unknown) => error);
    expect(locked).toBeInstanceOf(AccountLockedError);
    expect((locked as AccountLockedError).statusCode).toBe(423);
    expect(
      (locked as AccountLockedError).getMetadata("retryAfterSeconds"),
    ).toBeGreaterThan(0);

    // Even the correct password is refused while the lockout stands.
    await expect(
      auth.login({ identifier: "alice@example.com", password: "password123" }),
    ).rejects.toThrow(AccountLockedError);
  });

  it("locks unknown identifiers the same way (no oracle)", async () => {
    const { auth } = await fixture({
      loginThrottle: {
        store: createMemoryLoginAttemptStore(),
        maxFailedAttempts: 2,
      },
    });
    for (let i = 0; i < 2; i++) {
      await expect(
        auth.login({ identifier: "ghost@example.com", password: "nope" }),
      ).rejects.toThrow(InvalidCredentialsError);
    }
    await expect(
      auth.login({ identifier: "ghost@example.com", password: "nope" }),
    ).rejects.toThrow(AccountLockedError);
  });

  it("rate-limits attempts inside the window", async () => {
    const { auth } = await fixture({
      loginThrottle: {
        store: createMemoryLoginAttemptStore({ windowSeconds: 60 }),
        // High enough that the lockout never fires first.
        maxFailedAttempts: 1000,
        maxAttemptsPerWindow: 3,
        windowSeconds: 60,
      },
    });

    for (let i = 0; i < 3; i++) {
      await expect(
        auth.login({ identifier: "alice@example.com", password: "nope" }),
      ).rejects.toThrow(InvalidCredentialsError);
    }

    const limited = await auth
      .login({ identifier: "alice@example.com", password: "nope" })
      .catch((error: unknown) => error);
    expect(limited).toBeInstanceOf(AuthRateLimitError);
    expect((limited as AuthRateLimitError).statusCode).toBe(429);
  });

  it("clears the failure streak on a successful login", async () => {
    const { auth } = await fixture({
      loginThrottle: {
        store: createMemoryLoginAttemptStore(),
        maxFailedAttempts: 3,
      },
    });

    await expect(
      auth.login({ identifier: "alice@example.com", password: "nope" }),
    ).rejects.toThrow();
    await expect(
      auth.login({ identifier: "alice@example.com", password: "nope" }),
    ).rejects.toThrow();
    await auth.login({
      identifier: "alice@example.com",
      password: "password123",
    });

    // Two more failures must not trip a lockout that counted the old ones.
    await expect(
      auth.login({ identifier: "alice@example.com", password: "nope" }),
    ).rejects.toThrow(InvalidCredentialsError);
    await expect(
      auth.login({ identifier: "alice@example.com", password: "nope" }),
    ).rejects.toThrow(InvalidCredentialsError);
  });
});

// AUTH-03 — sessions were written but never read.
describe("session-bound tokens", () => {
  it("binds the issued tokens to the session", async () => {
    const { auth } = await fixture();
    const { tokens, sessionId } = await auth.login({
      identifier: "alice@example.com",
      password: "password123",
    });
    const payload = await auth.verifyToken(tokens.accessToken);
    expect(payload.sid).toBe(sessionId);
  });

  it("logoutAll terminates every session for the user", async () => {
    const { auth } = await fixture();
    const first = await auth.login({
      identifier: "alice@example.com",
      password: "password123",
    });
    const second = await auth.login({
      identifier: "alice@example.com",
      password: "password123",
    });

    await auth.logoutAll(ALICE.id);

    await expect(auth.verifyToken(first.tokens.accessToken)).rejects.toThrow(
      SessionExpiredError,
    );
    await expect(auth.refresh(second.tokens.refreshToken)).rejects.toThrow(
      SessionExpiredError,
    );
  });

  it("revokes the surrendered refresh token on logout", async () => {
    const revocationStore = createMemoryTokenRevocationStore();
    const { auth } = await fixture({ revocationStore });
    const { sessionId, tokens } = await auth.login({
      identifier: "alice@example.com",
      password: "password123",
    });

    await auth.logout(sessionId, tokens.refreshToken);
    expect(
      await revocationStore.isRevoked(extractJti(tokens.refreshToken)),
    ).toBe(true);
  });
});

function extractJti(token: string): TokenId {
  const payload = JSON.parse(
    Buffer.from(token.split(".")[1]!, "base64url").toString("utf-8"),
  ) as { jti: string };
  return payload.jti as TokenId;
}

// AUTH-06 — refresh never re-loaded the user.
describe("refresh re-loads the user", () => {
  it("stops minting tokens once the account is deactivated", async () => {
    const { auth, users } = await fixture();
    const { tokens } = await auth.login({
      identifier: "alice@example.com",
      password: "password123",
    });

    users.set("alice@example.com", { ...ALICE, active: false });

    await expect(auth.refresh(tokens.refreshToken)).rejects.toThrow(
      AccountDeactivatedError,
    );
  });

  it("stops minting tokens once the account is deleted", async () => {
    const { auth, users } = await fixture();
    const { tokens } = await auth.login({
      identifier: "alice@example.com",
      password: "password123",
    });

    users.clear();

    await expect(auth.refresh(tokens.refreshToken)).rejects.toThrow(
      AccountDeactivatedError,
    );
  });

  it("propagates a demotion instead of copying stale roles forward", async () => {
    const { auth, users } = await fixture();
    const { tokens } = await auth.login({
      identifier: "alice@example.com",
      password: "password123",
    });

    users.set("alice@example.com", { ...ALICE, roles: ["viewer"] });

    const refreshed = await auth.refresh(tokens.refreshToken);
    const payload = await auth.verifyToken(refreshed.accessToken);
    expect(payload.roles).toEqual(["viewer"]);
  });
});

// AUTH-05 — rotation was a check-then-act race.
describe("refresh token rotation is atomic", () => {
  it("lets only one of two concurrent refreshes succeed", async () => {
    const { auth } = await fixture({
      revocationStore: createMemoryTokenRevocationStore(),
    });
    const { tokens } = await auth.login({
      identifier: "alice@example.com",
      password: "password123",
    });

    const results = await Promise.allSettled([
      auth.refresh(tokens.refreshToken),
      auth.refresh(tokens.refreshToken),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      TokenRevokedError,
    );
  });

  it("destroys the user's sessions when a used refresh token is replayed", async () => {
    const { auth } = await fixture({
      revocationStore: createMemoryTokenRevocationStore(),
    });
    const { tokens } = await auth.login({
      identifier: "alice@example.com",
      password: "password123",
    });

    const rotated = await auth.refresh(tokens.refreshToken);

    // The thief replays the token the legitimate client already used.
    await expect(auth.refresh(tokens.refreshToken)).rejects.toThrow(
      TokenRevokedError,
    );

    // The whole family is now dead, including the pair minted a moment ago.
    await expect(auth.verifyToken(rotated.accessToken)).rejects.toThrow(
      SessionExpiredError,
    );
    await expect(auth.refresh(rotated.refreshToken)).rejects.toThrow(
      SessionExpiredError,
    );
  });
});

// AUTH-24 — the no-engine fallback guard silently allowed everything.
describe("checkAccess fallback guard", () => {
  it("refuses to guess when no permission engine is configured", async () => {
    const { auth } = await fixture();
    await expect(
      auth.checkAccess({
        userId: "user-alice",
        roles: [],
        permission: "billing:refund",
        resourceOwnerId: "user-alice",
      }),
    ).rejects.toThrow(AuthConfigurationError);
  });

  it("grants ownership only when the fallback is opted into, and says so", async () => {
    const { auth } = await fixture({ allowInsecureFallbackGuard: true });
    const result = await auth.checkAccess({
      userId: "user-alice",
      roles: [],
      permission: "billing:refund",
      resourceOwnerId: "user-alice",
    });
    expect(result.allowed).toBe(true);
    expect(result.reason).toContain("fallback guard");
  });

  it("grants the configured admin role and denies everyone else", async () => {
    const { auth } = await fixture({
      allowInsecureFallbackGuard: true,
      fallbackAdminRole: "superadmin",
    });

    const superadmin = await auth.checkAccess({
      userId: "user-alice",
      roles: ["superadmin"],
      permission: "users:write",
    });
    expect(superadmin.allowed).toBe(true);
    expect(superadmin.reason).toContain("superadmin");

    const admin = await auth.checkAccess({
      userId: "user-alice",
      roles: ["admin"],
      permission: "users:write",
    });
    expect(admin.allowed).toBe(false);
    expect(admin.requiredPermission).toBe("users:write");
  });
});

// AUTH-28 — the service's password helpers were untested.
describe("service password helpers", () => {
  it("hashes and verifies through the service", async () => {
    const { auth } = await fixture();
    const hash = await auth.hashPassword("s3cret-passphrase");
    expect(hash).toMatch(/^scrypt\$/);
    expect(await auth.verifyPasswordHash("s3cret-passphrase", hash)).toBe(true);
    expect(await auth.verifyPasswordHash("wrong", hash)).toBe(false);
  });
});
