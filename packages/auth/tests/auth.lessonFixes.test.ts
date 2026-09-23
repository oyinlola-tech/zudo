/**
 * Fixes for bugs lesson writers reported against the published package:
 * lockout `Retry-After`, distinct error codes, `needsRehash()` on
 * `@zudojs/crypto` default hashes, login identifier normalization, and
 * sessions for users authenticated outside `login()`.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { ErrorCode } from "@zudojs/errors";
import { hashPassword as cryptoHashPassword } from "@zudojs/crypto";

import {
  AccountDeactivatedError,
  AccountLockedError,
  AuthConfigurationError,
  AuthRateLimitError,
  InvalidCredentialsError,
  TokenRevokedError,
  createAuthService,
  createMemoryLoginAttemptStore,
  createMemorySessionStore,
  needsRehash,
  normalizeLoginIdentifier,
  toUserId,
  type AuthServiceConfig,
  type AuthUser,
} from "../src/index.js";

const alice: AuthUser = {
  id: toUserId("u1"),
  email: "alice@example.com",
  roles: ["member"],
  active: true,
  createdAt: new Date(),
};
const retired: AuthUser = { ...alice, id: toUserId("u2"), active: false };
const users = new Map([
  [alice.id, alice],
  [retired.id, retired],
]);

function service(
  overrides: Partial<AuthServiceConfig> = {},
  seen: string[] = [],
) {
  const sessionStore = createMemorySessionStore();
  const auth = createAuthService({
    token: { accessSecret: "a".repeat(40), refreshSecret: "b".repeat(40) },
    sessionStore,
    findUser: async (identifier) => {
      seen.push(identifier);
      return identifier === alice.email ? alice : null;
    },
    findUserById: async (id) => users.get(id) ?? null,
    verifyPassword: async (_id, password) => password === "right-password",
    sessionTtlSeconds: 600,
    ...overrides,
  });
  return { auth, sessionStore };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("lockout Retry-After", () => {
  it("carries Retry-After computed from the remaining lockout", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const { auth } = service({
      loginThrottle: {
        store: createMemoryLoginAttemptStore(),
        maxFailedAttempts: 2,
        lockoutSeconds: 900,
      },
    });
    for (let i = 0; i < 2; i++) {
      await expect(
        auth.login({ identifier: alice.email, password: "wrong" }),
      ).rejects.toBeInstanceOf(InvalidCredentialsError);
    }

    vi.setSystemTime(1_000_000 + 300_500);
    const error = await auth
      .login({ identifier: alice.email, password: "right-password" })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AccountLockedError);
    const locked = error as AccountLockedError;
    expect(locked.statusCode).toBe(423);
    expect(locked.retryAfterSeconds).toBe(600);
    expect(locked.headers).toEqual({ "retry-after": "600" });
    expect(locked.metadata["retryAfterSeconds"]).toBe(600);
  });

  it("puts Retry-After on the rate-limit error as well", () => {
    const error = new AuthRateLimitError(undefined, { retryAfterSeconds: 12.2 });
    expect(error.headers).toEqual({ "retry-after": "13" });
    expect(new AccountLockedError().headers).toEqual({ "retry-after": "900" });
  });
});

describe("distinct auth error codes", () => {
  it("gives locked, deactivated and revoked their own code and status", () => {
    const locked = new AccountLockedError();
    const deactivated = new AccountDeactivatedError();
    const revoked = new TokenRevokedError();

    expect(locked.code).toBe(ErrorCode.ACCOUNT_LOCKED);
    expect(locked.statusCode).toBe(423);
    expect(deactivated.code).toBe(ErrorCode.ACCOUNT_DEACTIVATED);
    expect(deactivated.statusCode).toBe(403);
    expect(revoked.code).toBe(ErrorCode.TOKEN_REVOKED);
    expect(revoked.statusCode).toBe(401);
    expect(
      new Set([locked.code, deactivated.code, revoked.code, ErrorCode.FORBIDDEN])
        .size,
    ).toBe(4);
  });
});

describe("needsRehash()", () => {
  it("is false for a hash made with @zudojs/crypto's own defaults", async () => {
    const { encoded } = await cryptoHashPassword("crypto-default");
    expect(needsRehash(encoded)).toBe(false);
  });
});

describe("security: login() normalizes the identifier", () => {
  it("trims and lower-cases an email before findUser sees it", async () => {
    const seen: string[] = [];
    const { auth } = service({}, seen);

    const result = await auth.login({
      identifier: "  Alice@Example.COM ",
      password: "right-password",
    });

    expect(result.user.id).toBe(alice.id);
    expect(seen).toEqual(["alice@example.com"]);
  });

  it("trims a username but keeps its case", () => {
    expect(normalizeLoginIdentifier("  Bob_Smith ")).toBe("Bob_Smith");
    expect(normalizeLoginIdentifier("Ａlice@Example.com")).toBe(
      "alice@example.com",
    );
  });

  it("gives case and whitespace variants one lockout budget", async () => {
    const { auth } = service({
      loginThrottle: {
        store: createMemoryLoginAttemptStore(),
        maxFailedAttempts: 3,
      },
    });
    for (const variant of [
      "alice@example.com",
      "ALICE@EXAMPLE.COM",
      " Alice@Example.com ",
    ]) {
      await expect(
        auth.login({ identifier: variant, password: "wrong" }),
      ).rejects.toBeInstanceOf(InvalidCredentialsError);
    }

    await expect(
      auth.login({ identifier: "aLiCe@example.com", password: "right-password" }),
    ).rejects.toBeInstanceOf(AccountLockedError);
  });

  it("can be switched off or replaced", async () => {
    const raw: string[] = [];
    await service({ normalizeIdentifier: false }, raw)
      .auth.login({ identifier: " X@Y.io", password: "nope" })
      .catch(() => undefined);
    expect(raw).toEqual([" X@Y.io"]);

    const custom: string[] = [];
    await service({ normalizeIdentifier: (id) => `[${id}]` }, custom)
      .auth.login({ identifier: "x", password: "nope" })
      .catch(() => undefined);
    expect(custom).toEqual(["[x]"]);
  });
});

describe("createSessionForUser()", () => {
  it("is refused unless the method is enabled", async () => {
    const { auth } = service();

    await expect(
      auth.createSessionForUser(alice.id, { method: "oauth" }),
    ).rejects.toBeInstanceOf(AuthConfigurationError);
  });

  it("starts a session and issues verifiable tokens for an enabled method", async () => {
    const { auth, sessionStore } = service({ externalSessionMethods: ["oauth"] });

    const result = await auth.createSessionForUser(alice.id, {
      method: "oauth",
      ip: "203.0.113.9",
      metadata: { provider: "github" },
    });

    expect(result.user).toBe(alice);
    const payload = await auth.verifyToken(result.tokens.accessToken);
    expect(payload.sub).toBe(alice.id);
    expect(payload.sid).toBe(result.sessionId);
    expect((await sessionStore.get(result.sessionId))?.metadata).toEqual({
      provider: "github",
      authMethod: "oauth",
    });
    await auth.logout(result.sessionId);
    await expect(auth.verifyToken(result.tokens.accessToken)).rejects.toThrow();
  });

  it("refuses a method not in the list, an unknown user and a deactivated one", async () => {
    const { auth } = service({ externalSessionMethods: ["oauth"] });

    await expect(
      auth.createSessionForUser(alice.id, { method: "magic-link" }),
    ).rejects.toBeInstanceOf(AuthConfigurationError);
    await expect(
      auth.createSessionForUser(toUserId("nobody"), { method: "oauth" }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
    await expect(
      auth.createSessionForUser(retired.id, { method: "oauth" }),
    ).rejects.toBeInstanceOf(AccountDeactivatedError);
  });
});

describe("Retry-After over a real @zudojs/http server", () => {
  it("reaches the client with the 423", async () => {
    // http is a higher tier than auth; the test reaches its build by path.
    const http = await import("../../http/dist/index.js");
    const router = new http.HttpRouter();
    router.post("/login", () => {
      throw new AccountLockedError(undefined, { retryAfterSeconds: 42 });
    });
    const adapter = http.createNodeHttpAdapter({
      host: "127.0.0.1",
      port: 0,
      handler: async (request) => (await router.dispatch(request)).response,
    });
    await adapter.start();
    try {
      const response = await fetch(
        `http://127.0.0.1:${adapter.address?.port}/login`,
        { method: "POST" },
      );
      expect(response.status).toBe(423);
      expect(response.headers.get("retry-after")).toBe("42");
    } finally {
      await adapter.stop();
    }
  });
});
