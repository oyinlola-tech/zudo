/**
 * Round 12 regressions for @zudojs/auth (academy findings #102, #116, #122).
 */

import { describe, it, expect } from "vitest";
import {
  createAuthService,
  createMemorySessionStore,
  createMemoryTokenRevocationStore,
  createMemoryLoginAttemptStore,
  createTokenPair,
  verifyAccessToken,
  hashPassword,
  verifyPassword,
  toUserId,
  AuthConfigurationError,
  TokenExpiredError,
  SessionExpiredError,
  AccountLockedError,
  type AuthServiceConfig,
  type AuthUser,
  type TokenConfig,
  type TokenId,
  type TokenRevocationStore,
} from "../src/index.js";

const CONFIG: TokenConfig = {
  accessSecret: "test-access-secret-key-for-testing-32chars!",
  refreshSecret: "test-refresh-secret-key-for-testing-32ch!",
  accessTtl: 900,
  refreshTtl: 604_800,
};

const ALICE: AuthUser = {
  id: toUserId("user-alice"),
  email: "alice@example.com",
  roles: ["editor"],
  claims: { plan: "pro", org: "acme", sub: "forged", exp: 1 },
  active: true,
  createdAt: new Date("2024-01-01"),
};

function fakeClock(startMs: number) {
  let now = startMs;
  return {
    now: () => now,
    advance(ms: number) {
      now += ms;
    },
  };
}

async function fixture(overrides: Partial<AuthServiceConfig> = {}) {
  const hash = await hashPassword("password123");
  return createAuthService({
    token: CONFIG,
    sessionStore: createMemorySessionStore(),
    findUser: async (id) => (id === ALICE.email ? ALICE : null),
    findUserById: async (id) => (id === ALICE.id ? ALICE : null),
    verifyPassword: async (_id, password) => verifyPassword(password, hash),
    sessionTtlSeconds: 3600,
    externalSessionMethods: ["oauth"],
    ...overrides,
  });
}

function decodePayload(token: string): Record<string, unknown> {
  const body = token.split(".")[1]!;
  return JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
}

/** A store that predates `revokeIfNotRevoked`. */
function legacyStore(): TokenRevocationStore {
  const revoked = new Set<TokenId>();
  return {
    async revoke(id) {
      revoked.add(id);
    },
    async isRevoked(id) {
      return revoked.has(id);
    },
  };
}

function nextWarning(): Promise<Error & { code?: string }> {
  return new Promise((resolve) => {
    process.once("warning", (warning) => resolve(warning));
  });
}

describe("#116 refresh() without revokeIfNotRevoked", () => {
  it("warns at construction when the store lacks the atomic claim", async () => {
    const warning = nextWarning();
    await fixture({ revocationStore: legacyStore() });
    const received = await warning;
    expect(received.code).toBe("ZUDO_AUTH_RACY_REVOCATION");
    expect(received.message).toMatch(/revokeIfNotRevoked/);
  });

  it("does not warn for a store that implements it", async () => {
    let warned = false;
    const listener = (): void => {
      warned = true;
    };
    process.on("warning", listener);
    await fixture({ revocationStore: createMemoryTokenRevocationStore() });
    await new Promise((resolve) => setImmediate(resolve));
    process.off("warning", listener);
    expect(warned).toBe(false);
  });

  it("requireAtomicRevocation makes it a configuration error", async () => {
    await expect(
      fixture({ revocationStore: legacyStore(), requireAtomicRevocation: true }),
    ).rejects.toBeInstanceOf(AuthConfigurationError);
  });
});

describe("#122 custom claims reach the token", () => {
  it("login() embeds user.claims and never lets them shadow reserved claims", async () => {
    const auth = await fixture();
    const { tokens, sessionId } = await auth.login({
      identifier: ALICE.email,
      password: "password123",
    });
    const payload = decodePayload(tokens.accessToken);
    expect(payload["plan"]).toBe("pro");
    expect(payload["org"]).toBe("acme");
    expect(payload["sub"]).toBe(ALICE.id);
    expect(payload["exp"]).not.toBe(1);
    expect(payload["sid"]).toBe(sessionId);

    const verified = await auth.verifyToken(tokens.accessToken);
    expect(verified["plan"]).toBe("pro");
    expect(decodePayload(tokens.refreshToken)["plan"]).toBe("pro");
  });

  it("refresh() and createSessionForUser() carry the claims too", async () => {
    const auth = await fixture();
    const login = await auth.login({
      identifier: ALICE.email,
      password: "password123",
    });
    const rotated = await auth.refresh(login.tokens.refreshToken);
    expect(decodePayload(rotated.accessToken)["plan"]).toBe("pro");

    const external = await auth.createSessionForUser(ALICE.id, {
      method: "oauth",
    });
    expect(decodePayload(external.tokens.accessToken)["org"]).toBe("acme");
  });

  it("createTokenPair() accepts a claims option directly", () => {
    const pair = createTokenPair(ALICE.id, CONFIG, {
      claims: { tenant: "t1", jti: "forged" },
    });
    const payload = decodePayload(pair.accessToken);
    expect(payload["tenant"]).toBe("t1");
    expect(payload["jti"]).not.toBe("forged");
    expect(verifyAccessToken(pair.accessToken, CONFIG).valid).toBe(true);
  });
});

describe("#102 injectable clock", () => {
  it("tokens are minted and verified against the injected clock", async () => {
    const clock = fakeClock(Date.UTC(2030, 0, 1));
    const auth = await fixture({
      clock,
      sessionStore: createMemorySessionStore({ clock }),
    });
    const { tokens } = await auth.login({
      identifier: ALICE.email,
      password: "password123",
    });
    expect(decodePayload(tokens.accessToken)["iat"]).toBe(
      Math.floor(clock.now() / 1000),
    );
    await expect(auth.verifyToken(tokens.accessToken)).resolves.toBeDefined();

    clock.advance((CONFIG.accessTtl! + 1) * 1000);
    await expect(auth.verifyToken(tokens.accessToken)).rejects.toBeInstanceOf(
      TokenExpiredError,
    );
  });

  it("the memory session store expires sessions by the injected clock", async () => {
    const clock = fakeClock(Date.UTC(2030, 0, 1));
    const auth = await fixture({
      clock,
      sessionStore: createMemorySessionStore({ clock }),
      sessionTtlSeconds: 60,
      token: { ...CONFIG, accessTtl: 3600 },
    });
    const { tokens } = await auth.login({
      identifier: ALICE.email,
      password: "password123",
    });
    clock.advance(61_000);
    await expect(auth.verifyToken(tokens.accessToken)).rejects.toBeInstanceOf(
      SessionExpiredError,
    );
  });

  it("lockouts and revocation expiry follow the injected clock", async () => {
    const clock = fakeClock(Date.UTC(2030, 0, 1));
    const store = createMemoryLoginAttemptStore({ clock });
    const auth = await fixture({
      clock,
      loginThrottle: { store, maxFailedAttempts: 1, lockoutSeconds: 30 },
    });
    const bad = { identifier: ALICE.email, password: "nope" };
    await expect(auth.login(bad)).rejects.toThrow();
    await expect(auth.login(bad)).rejects.toBeInstanceOf(AccountLockedError);
    clock.advance(31_000);
    await expect(auth.login(bad)).rejects.not.toBeInstanceOf(
      AccountLockedError,
    );

    const revocation = createMemoryTokenRevocationStore({ clock });
    const jti = "jti-1" as TokenId;
    await revocation.revoke(jti, Math.floor(clock.now() / 1000) + 10);
    expect(await revocation.isRevoked(jti)).toBe(true);
    clock.advance(11_000);
    expect(await revocation.isRevoked(jti)).toBe(false);
  });
});
