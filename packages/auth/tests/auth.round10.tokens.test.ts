/**
 * Audit round 10 regressions for @zudojs/auth: token binding and encoding.
 */

import { describe, it, expect } from "vitest";

import {
  TokenInvalidError,
  createAuthService,
  createMemorySessionStore,
  createTokenPair,
  jwt,
  refreshAccessToken,
  toUserId,
  verifyAccessToken,
  type AuthServiceConfig,
  type AuthUser,
  type TokenConfig,
} from "../src/index.js";

const TOKEN: TokenConfig = {
  accessSecret: "access-secret-that-is-at-least-32-bytes-long",
  refreshSecret: "refresh-secret-that-is-at-least-32-bytes-long",
};

const user: AuthUser = {
  id: toUserId("u1"),
  email: "u1@example.com",
  roles: [],
  active: true,
  createdAt: new Date(),
};

function service(extra?: Partial<AuthServiceConfig>) {
  return createAuthService({
    token: TOKEN,
    sessionStore: createMemorySessionStore(),
    findUser: async () => user,
    findUserById: async () => user,
    verifyPassword: async (_id, pw) => pw === "right",
    sessionTtlSeconds: 600,
    ...extra,
  });
}

describe("security/AUTH-01", () => {
  it("refreshAccessToken keeps the sid, so logout still kills the new pair", async () => {
    const auth = service();
    const { tokens, sessionId } = await auth.login({ identifier: "u1", password: "right" });
    await auth.logout(sessionId);

    const revived = refreshAccessToken(tokens.refreshToken, TOKEN);
    expect(revived).not.toBeNull();
    const payload = verifyAccessToken(revived!.accessToken, TOKEN).payload;
    expect(payload?.sid).toBe(sessionId);
    await expect(auth.verifyToken(revived!.accessToken)).rejects.toThrow();
    await expect(auth.refresh(revived!.refreshToken)).rejects.toThrow();
    expect(jwt.refreshAccessToken).toBe(refreshAccessToken);
  });

  it("the service rejects session-less tokens by default", async () => {
    const auth = service();
    const bare = createTokenPair(user.id, TOKEN);
    await expect(auth.verifyToken(bare.accessToken)).rejects.toBeInstanceOf(TokenInvalidError);
    await expect(auth.refresh(bare.refreshToken)).rejects.toBeInstanceOf(TokenInvalidError);
  });

  it("allowSessionlessTokens opts back in", async () => {
    const auth = service({ allowSessionlessTokens: true });
    const bare = createTokenPair(user.id, TOKEN);
    await expect(auth.verifyToken(bare.accessToken)).resolves.toMatchObject({ sub: "u1" });
  });
});

describe("security/AUTH-04", () => {
  it("accepts exactly one spelling of the signature segment", () => {
    const { accessToken } = createTokenPair(user.id, TOKEN);
    const [h, b, s] = accessToken.split(".") as [string, string, string];
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const accepted = [...alphabet].filter((c) => {
      const variant = `${h}.${b}.${s.slice(0, -1)}${c}`;
      return variant !== accessToken && verifyAccessToken(variant, TOKEN).valid;
    });
    expect(accepted).toEqual([]);
    for (const junk of ["=", "==", "$", " ", "!", "%"]) {
      expect(verifyAccessToken(`${h}.${b}.${s}${junk}`, TOKEN).valid).toBe(false);
    }
    expect(verifyAccessToken(accessToken, TOKEN).valid).toBe(true);
  });
});
