import { describe, it, expect, vi, afterEach } from "vitest";
import { createMemorySessionStore } from "../src/index.js";
import { toUserId } from "../src/index.js";

afterEach(() => {
  vi.useRealTimers();
});

// AUTH-08 — sliding expiration had no absolute ceiling, so a session that
// was polled once per idle window lived forever.
describe("absolute session lifetime", () => {
  it("expires a continuously-touched session at the absolute deadline", async () => {
    vi.useFakeTimers();
    const store = createMemorySessionStore({ purgeIntervalMs: 0 });
    const session = await store.create({
      userId: toUserId("user-1"),
      ttlSeconds: 60,
      absoluteTtlSeconds: 120,
    });
    expect(session.absoluteExpiresAt).toBeInstanceOf(Date);

    for (let elapsed = 0; elapsed < 120_000; elapsed += 30_000) {
      vi.advanceTimersByTime(30_000);
      await store.touch(session.id);
      // Still inside the absolute window.
      expect(await store.get(session.id)).not.toBeNull();
    }

    // Past createdAt + 120s: no amount of activity keeps it alive.
    vi.advanceTimersByTime(1_000);
    expect(await store.get(session.id)).toBeNull();
  });

  it("never extends expiresAt past the absolute deadline", async () => {
    vi.useFakeTimers();
    const store = createMemorySessionStore({ purgeIntervalMs: 0 });
    const session = await store.create({
      userId: toUserId("user-1"),
      ttlSeconds: 3600,
      absoluteTtlSeconds: 60,
    });
    expect(session.expiresAt.getTime()).toBe(
      session.absoluteExpiresAt!.getTime(),
    );

    vi.advanceTimersByTime(10_000);
    await store.touch(session.id);
    const touched = await store.get(session.id);
    expect(touched!.expiresAt.getTime()).toBe(
      session.absoluteExpiresAt!.getTime(),
    );
  });

  it("still slides indefinitely when no absolute lifetime is configured", async () => {
    vi.useFakeTimers();
    const store = createMemorySessionStore({ purgeIntervalMs: 0 });
    const session = await store.create({
      userId: toUserId("user-1"),
      ttlSeconds: 60,
    });
    expect(session.absoluteExpiresAt).toBeUndefined();

    for (let i = 0; i < 10; i++) {
      vi.advanceTimersByTime(30_000);
      await store.touch(session.id);
    }
    expect(await store.get(session.id)).not.toBeNull();
  });
});

// AUTH-19 — expired sessions were only reclaimed on `create`, and `touch`
// on an expired session was an untested no-op.
describe("expired session reclamation", () => {
  it("drops an idle-expired session on get", async () => {
    vi.useFakeTimers();
    const store = createMemorySessionStore({ purgeIntervalMs: 0 });
    const session = await store.create({
      userId: toUserId("user-1"),
      ttlSeconds: 10,
    });
    vi.advanceTimersByTime(11_000);
    expect(await store.get(session.id)).toBeNull();
  });

  it("does not resurrect an expired session via touch", async () => {
    vi.useFakeTimers();
    const store = createMemorySessionStore({ purgeIntervalMs: 0 });
    const session = await store.create({
      userId: toUserId("user-1"),
      ttlSeconds: 10,
    });
    vi.advanceTimersByTime(11_000);
    await store.touch(session.id);
    expect(await store.get(session.id)).toBeNull();
  });

  it("reclaims expired sessions without a subsequent create", async () => {
    vi.useFakeTimers();
    const store = createMemorySessionStore({ purgeIntervalMs: 0 });
    const stale = await store.create({
      userId: toUserId("user-1"),
      ttlSeconds: 10,
    });
    const other = await store.create({
      userId: toUserId("user-2"),
      ttlSeconds: 10,
    });
    vi.advanceTimersByTime(11_000);

    // Touching one session sweeps the store; both rows are gone afterwards,
    // and no `create` call was needed to trigger it.
    await store.touch(stale.id);
    expect(await store.get(stale.id)).toBeNull();
    expect(await store.get(other.id)).toBeNull();
  });

  it("touch keeps a live session alive and extends it", async () => {
    vi.useFakeTimers();
    const store = createMemorySessionStore({ purgeIntervalMs: 0 });
    const session = await store.create({
      userId: toUserId("user-1"),
      ttlSeconds: 60,
    });
    vi.advanceTimersByTime(30_000);
    await store.touch(session.id);
    const touched = await store.get(session.id);
    expect(touched).not.toBeNull();
    expect(touched!.expiresAt.getTime()).toBeGreaterThan(
      session.expiresAt.getTime(),
    );
    expect(touched!.lastActivityAt.getTime()).toBeGreaterThan(
      session.lastActivityAt.getTime(),
    );
  });
});
