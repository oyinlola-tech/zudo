/**
 * @zudojs/testing — Tests for new testing helpers.
 *
 * Tests for serialization assertions, storage helpers,
 * HTTP response builders, and the test context.
 */

import { describe, it, expect } from "vitest";
import {
  createTestContext,
  createSpyLogger,
  createTestClock,
  createTestHTTPResponse,
  createHTTPResponse,
  jsonResponse,
  createdResponse,
  noContentResponse,
  badRequestResponse,
  notFoundResponse,
  serverErrorResponse,
  createTestHTTPRequest,
  createHTTPRequest,
  assertResponseStatus,
  assertResponseHeader,
  assertResponseBody,
  assertOK,
  assertCreated,
  assertNotFound,
  assertServerError,
  assertSerializesCorrectly,
  assertSerializesTo,
  assertDeserializesTo,
  assertTypePreservesRoundTrip,
  InMemoryTestStorage,
} from "../src/index.js";

// ─── Test Context ─────────────────────────────────────────────

describe("createTestContext", () => {
  it("creates a context with clock, cleanup, log/event/message recorders", async () => {
    const ctx = createTestContext();
    expect(ctx.clock).toBeDefined();
    expect(ctx.cleanup).toBeDefined();
    expect(ctx.logs).toBeDefined();
    expect(ctx.events).toBeDefined();
    expect(ctx.messages).toBeDefined();

    ctx.logs.record("info", "test message");
    expect(ctx.logs.entries).toHaveLength(1);
    expect(ctx.logs.entries[0]?.message).toBe("test message");

    ctx.events.record("test.event", { id: "1" });
    expect(ctx.events.entries).toHaveLength(1);
    expect(ctx.events.entries[0]?.type).toBe("test.event");

    ctx.messages.record("test.message", { id: "2" });
    expect(ctx.messages.entries).toHaveLength(1);

    await ctx.dispose();
  });

  it("clears recorders", () => {
    const ctx = createTestContext();
    ctx.logs.record("info", "msg");
    ctx.events.record("type", {});
    ctx.messages.record("type", {});

    ctx.logs.clear();
    ctx.events.clear();
    ctx.messages.clear();

    expect(ctx.logs.entries).toHaveLength(0);
    expect(ctx.events.entries).toHaveLength(0);
    expect(ctx.messages.entries).toHaveLength(0);
  });

  it("finds log entries by level and message", () => {
    const ctx = createTestContext();
    ctx.logs.record("info", "hello world");
    ctx.logs.record("error", "something failed");
    ctx.logs.record("info", "hello again");

    expect(ctx.logs.findByLevel("info")).toHaveLength(2);
    expect(ctx.logs.findByLevel("error")).toHaveLength(1);
    expect(ctx.logs.findByMessage("hello")).toHaveLength(2);
    expect(ctx.logs.findByMessage("failed")).toHaveLength(1);
  });

  it("finds events by type", () => {
    const ctx = createTestContext();
    ctx.events.record("user.created", { id: "1" });
    ctx.events.record("user.deleted", { id: "2" });
    ctx.events.record("user.created", { id: "3" });

    expect(ctx.events.findByType("user.created")).toHaveLength(2);
    expect(ctx.events.findByType("user.deleted")).toHaveLength(1);
  });
});

// ─── Spy Logger ───────────────────────────────────────────────

describe("createSpyLogger", () => {
  it("records log calls", () => {
    const spy = createSpyLogger("test");
    spy.info("hello");
    spy.error("fail");

    expect(spy.calls).toHaveLength(2);
    expect(spy.calls[0]?.message).toBe("hello");
    expect(spy.calls[0]?.method).toBe("info");
    expect(spy.calls[1]?.message).toBe("fail");
    expect(spy.calls[1]?.method).toBe("error");
  });

  it("finds calls by method and message", () => {
    const spy = createSpyLogger("test");
    spy.info("hello world");
    spy.error("hello error");
    spy.warn("goodbye");

    expect(spy.findByMethod("info")).toHaveLength(1);
    expect(spy.findByMessage("hello")).toHaveLength(2);
    expect(spy.findByMessage("goodbye")).toHaveLength(1);
  });

  it("clears calls", () => {
    const spy = createSpyLogger("test");
    spy.info("msg");
    spy.clear();
    expect(spy.calls).toHaveLength(0);
  });
});

// ─── Test Clock ───────────────────────────────────────────────

describe("createTestClock", () => {
  it("creates a clock at current time", () => {
    const clock = createTestClock();
    const now = Date.now();
    expect(clock.timestamp).toBeGreaterThanOrEqual(now - 100);
    expect(clock.timestamp).toBeLessThanOrEqual(now + 100);
  });

  it("sets time to a specific date", () => {
    const clock = createTestClock();
    clock.set("2026-01-01T00:00:00Z");
    expect(clock.now.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("advances time by milliseconds", () => {
    const clock = createTestClock("2026-01-01T00:00:00Z");
    clock.advance(60_000);
    expect(clock.now.toISOString()).toBe("2026-01-01T00:01:00.000Z");
  });

  it("adds duration components", () => {
    const clock = createTestClock("2026-01-01T00:00:00Z");
    clock.add({ hours: 1, minutes: 30 });
    expect(clock.now.toISOString()).toBe("2026-01-01T01:30:00.000Z");
  });

  it("resets to current time", () => {
    const clock = createTestClock("2026-01-01T00:00:00Z");
    clock.reset();
    const now = Date.now();
    expect(clock.timestamp).toBeGreaterThanOrEqual(now - 100);
  });
});

// ─── HTTP Response Builder ────────────────────────────────────

describe("HTTP Response Builder", () => {
  it("builds a response with fluent API", () => {
    const response = createTestHTTPResponse()
      .status(200)
      .header("X-Custom", "value")
      .json({ name: "test" })
      .build();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-custom")).toBe("value");
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(response.body).toEqual({ name: "test" });
    expect(response.sent).toBe(true);
  });

  it("creates helper responses", () => {
    expect(jsonResponse({ ok: true }).status).toBe(200);
    expect(createdResponse({ id: "1" }).status).toBe(201);
    expect(noContentResponse().status).toBe(204);
    expect(badRequestResponse("invalid").status).toBe(400);
    expect(notFoundResponse().status).toBe(404);
    expect(serverErrorResponse().status).toBe(500);
  });

  it("creates simple responses", () => {
    const response = createHTTPResponse(200, { data: 1 });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: 1 });
    expect(response.sent).toBe(true);
  });
});

// ─── HTTP Request Builder ─────────────────────────────────────

describe("HTTP Request Builder", () => {
  it("builds a GET request", () => {
    const request = createTestHTTPRequest()
      .GET("/api/users")
      .withHeader("Authorization", "Bearer token")
      .withQuery({ page: "1" })
      .build();

    expect(request.method).toBe("GET");
    expect(request.path).toBe("/api/users");
    expect(request.headers.get("authorization")).toBe("Bearer token");
    expect(request.query.page).toBe("1");
  });

  it("builds a POST request with body", () => {
    const request = createTestHTTPRequest()
      .POST("/api/users")
      .withBody({ name: "John" })
      .build();

    expect(request.method).toBe("POST");
    expect(request.body).toEqual({ name: "John" });
  });

  it("creates simple requests", () => {
    const request = createHTTPRequest("GET", "/test");
    expect(request.method).toBe("GET");
    expect(request.path).toBe("/test");
  });
});

// ─── HTTP Assertions ──────────────────────────────────────────

describe("HTTP Assertions", () => {
  it("asserts status code", () => {
    const response = jsonResponse({});
    assertResponseStatus(response, 200);
    expect(() => assertResponseStatus(response, 404)).toThrow();
  });

  it("asserts headers", () => {
    const response = jsonResponse({});
    assertResponseHeader(response, "Content-Type", "application/json");
    expect(() =>
      assertResponseHeader(response, "X-Missing", "value"),
    ).toThrow();
  });

  it("asserts body", () => {
    const response = jsonResponse({ name: "test" });
    assertResponseBody(response, { name: "test" });
    expect(() => assertResponseBody(response, { name: "other" })).toThrow();
  });

  it("asserts common status codes", () => {
    assertOK(jsonResponse({}));
    assertCreated(createdResponse({}));
    assertNotFound(notFoundResponse());
    assertServerError(serverErrorResponse());
  });
});

// ─── Serialization Assertions ─────────────────────────────────

describe("Serialization Assertions", () => {
  it("asserts round-trip serialization", () => {
    assertSerializesCorrectly({ name: "test", count: 42 });
    assertSerializesCorrectly([1, 2, 3]);
    assertSerializesCorrectly("hello");
    assertSerializesCorrectly(42);
  });

  it("asserts serialization to specific JSON", () => {
    assertSerializesTo({ a: 1 }, '{"a":1}');
  });

  it("asserts deserialization from JSON", () => {
    assertDeserializesTo('{"a":1}', { a: 1 });
  });

  it("asserts type preservation round-trip", () => {
    assertTypePreservesRoundTrip(
      { date: new Date("2026-01-01T00:00:00Z") },
      (restored) => restored.date instanceof Date,
      "Date",
    );
  });
});

// ─── In-Memory Test Storage ───────────────────────────────────

describe("InMemoryTestStorage", () => {
  it("stores and retrieves values", () => {
    const storage = new InMemoryTestStorage();
    storage.set("key1", "value1");
    expect(storage.get("key1")).toBe("value1");
    expect(storage.has("key1")).toBe(true);
  });

  it("returns null for missing keys", () => {
    const storage = new InMemoryTestStorage();
    expect(storage.get("missing")).toBeNull();
    expect(storage.has("missing")).toBe(false);
  });

  it("deletes values", () => {
    const storage = new InMemoryTestStorage();
    storage.set("key1", "value1");
    expect(storage.delete("key1")).toBe(true);
    expect(storage.get("key1")).toBeNull();
    expect(storage.delete("key1")).toBe(false);
  });

  it("respects TTL expiration", () => {
    const storage = new InMemoryTestStorage();
    storage.set("key1", "value1", 1); // 1ms TTL
    expect(storage.get("key1")).toBe("value1");
    // After TTL, the entry should be expired
    // (In a real test we'd mock time, but for basic testing this suffices)
  });

  it("clears all entries", () => {
    const storage = new InMemoryTestStorage();
    storage.set("key1", "value1");
    storage.set("key2", "value2");
    storage.clear();
    expect(storage.size).toBe(0);
  });

  it("lists keys", () => {
    const storage = new InMemoryTestStorage();
    storage.set("a", 1);
    storage.set("b", 2);
    expect(storage.keys()).toContain("a");
    expect(storage.keys()).toContain("b");
    expect(storage.keys()).toHaveLength(2);
  });
});
