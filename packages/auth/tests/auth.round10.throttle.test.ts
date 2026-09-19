/**
 * Audit round 10 regressions for @zudojs/auth: login throttling.
 */

import { describe, it, expect, vi, afterEach } from "vitest";

import {
  AccountLockedError,
  createAuthService,
  createMemoryLoginAttemptStore,
  createMemorySessionStore,
  toUserId,
  type AuthUser,
} from "../src/index.js";

const user: AuthUser = {
  id: toUserId("u1"),
  email: "alice@example.com",
  roles: [],
  active: true,
  createdAt: new Date(),
};

afterEach(() => {
  vi.useRealTimers();
});

describe("security/AUTH-02", () => {
  it("a parallel burst gets maxFailedAttempts guesses, not maxAttemptsPerWindow", async () => {
    let guesses = 0;
    const auth = createAuthService({
      token: {
        accessSecret: "a".repeat(40),
        refreshSecret: "b".repeat(40),
      },
      sessionStore: createMemorySessionStore(),
      findUser: async () => user,
      findUserById: async () => user,
      verifyPassword: async (_id, pw) => {
        guesses++;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return pw === "secret-password";
      },
      sessionTtlSeconds: 600,
      loginThrottle: {
        store: createMemoryLoginAttemptStore(),
        maxFailedAttempts: 5,
        maxAttemptsPerWindow: 20,
      },
    });
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, (_, i) =>
        auth.login({ identifier: "alice", password: `guess${i}` }),
      ),
    );
    expect(guesses).toBe(5);
    const locked = results.filter(
      (r) => r.status === "rejected" && r.reason instanceof AccountLockedError,
    );
    expect(locked).toHaveLength(15);
    await expect(
      auth.login({ identifier: "alice", password: "secret-password" }),
    ).rejects.toBeInstanceOf(AccountLockedError);
  });
});

describe("security/AUTH-03", () => {
  it("evicts idle single-failure entries after the failure TTL", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const store = createMemoryLoginAttemptStore({
      windowSeconds: 1,
      purgeIntervalMs: 0,
      failureTtlSeconds: 60,
    });
    for (let i = 0; i < 500; i++) await store.recordFailure(`spray-${i}`);
    vi.setSystemTime(1_000_000 + 61_000);
    await store.get("trigger-sweep");
    for (let i = 0; i < 500; i++) {
      expect(await store.get(`spray-${i}`)).toEqual({ failures: 0, attempts: 0 });
    }
  });

  it("caps the number of tracked identifiers, keeping locked ones", async () => {
    const store = createMemoryLoginAttemptStore({ maxEntries: 10 });
    await store.lock("victim", Date.now() + 60_000);
    for (let i = 0; i < 100; i++) await store.recordFailure(`spray-${i}`);
    expect((await store.get("victim")).lockedUntil).toBeGreaterThan(Date.now());
    let tracked = 0;
    for (let i = 0; i < 100; i++) {
      if ((await store.get(`spray-${i}`)).failures > 0) tracked++;
    }
    expect(tracked).toBeLessThanOrEqual(9);
  });

  it("still remembers a fresh failure streak", async () => {
    const store = createMemoryLoginAttemptStore({ purgeIntervalMs: 0 });
    await store.recordFailure("alice");
    await store.recordFailure("alice");
    expect((await store.get("alice")).failures).toBe(2);
  });
});
