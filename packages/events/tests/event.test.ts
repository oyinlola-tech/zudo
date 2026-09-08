import { describe, it, expect } from "vitest";
import {
  createEvent,
  isEvent,
  defineEvent,
  createDerivedEvent,
  describeEvent,
  getEventType,
  getEventPayload,
} from "../src/eventTypes/eventDefinition.type.js";
import {
  isValidEventType,
  matchesEventType,
  normalizeEventType,
  createEventType,
  getEventNamespace,
  getEventAction,
  getEventTypeSegments,
  createEventTypePattern,
  assertEventType,
  tryNormalizeEventType,
  filterEventsByType,
} from "../src/eventTypes/eventType.type.js";
import {
  isPrimitiveEventPayload,
  isObjectEventPayload,
  isJsonEventPayload,
  createEventPayload,
  deepFreeze,
  stripUndefinedValues,
  describeEventPayload,
} from "../src/eventTypes/eventPayload.type.js";

// ─── Event creation ─────────────────────────────────────

describe("createEvent", () => {
  it("should create an event with required fields", () => {
    const event = createEvent({
      type: "user.created",
      payload: { name: "John" },
    });

    expect(event.type).toBe("user.created");
    expect(event.payload).toEqual({ name: "John" });
    expect(event.id).toMatch(/^event:/);
    expect(event.timestamp).toBeInstanceOf(Date);
  });

  it("should accept a custom id", () => {
    const event = createEvent({
      type: "test",
      payload: null,
      id: "custom-id",
    });

    expect(event.id).toBe("custom-id");
  });

  it("should accept a custom timestamp", () => {
    const ts = new Date("2024-01-01");
    const event = createEvent({
      type: "test",
      payload: null,
      timestamp: ts,
    });

    expect(event.timestamp.getTime()).toBe(ts.getTime());
  });

  it("should accept numeric timestamp", () => {
    const ts = Date.now();
    const event = createEvent({
      type: "test",
      payload: null,
      timestamp: ts,
    });

    expect(event.timestamp.getTime()).toBe(ts);
  });

  it("should include source, correlationId, causationId", () => {
    const event = createEvent({
      type: "test",
      payload: null,
      source: "auth",
      correlationId: "corr-1",
      causationId: "cause-1",
    });

    expect(event.source).toBe("auth");
    expect(event.correlationId).toBe("corr-1");
    expect(event.causationId).toBe("cause-1");
  });

  it("should freeze metadata", () => {
    const event = createEvent({
      type: "test",
      payload: null,
      metadata: { key: "value" },
    });

    expect(event.metadata).toEqual({ key: "value" });
    expect(Object.isFrozen(event.metadata)).toBe(true);
  });

  it("should be frozen", () => {
    const event = createEvent({
      type: "test",
      payload: null,
    });

    expect(Object.isFrozen(event)).toBe(true);
  });

  it("should throw for empty type", () => {
    expect(() => createEvent({ type: "", payload: null })).toThrow(
      "non-empty string",
    );
  });

  it("should throw for whitespace-only type", () => {
    expect(() => createEvent({ type: "  ", payload: null })).toThrow(
      "non-empty string",
    );
  });
});

// ─── isEvent ────────────────────────────────────────────

describe("isEvent", () => {
  it("should return true for valid events", () => {
    const event = createEvent({
      type: "test",
      payload: null,
    });
    expect(isEvent(event)).toBe(true);
  });

  it("should return false for non-events", () => {
    expect(isEvent(null)).toBe(false);
    expect(isEvent(undefined)).toBe(false);
    expect(isEvent("string")).toBe(false);
    expect(isEvent(42)).toBe(false);
    expect(isEvent({})).toBe(false);
  });
});

// ─── defineEvent ────────────────────────────────────────

describe("defineEvent", () => {
  it("should create a typed event definition", () => {
    const userCreated = defineEvent<"user.created", { name: string }>(
      "user.created",
    );

    expect(userCreated.type).toBe("user.created");

    const event = userCreated.create({ name: "John" });
    expect(event.type).toBe("user.created");
    expect(event.payload).toEqual({ name: "John" });
  });

  it("should throw for empty type", () => {
    expect(() => defineEvent("")).toThrow("non-empty string");
  });
});

// ─── createDerivedEvent ─────────────────────────────────

describe("createDerivedEvent", () => {
  it("should preserve correlation from source", () => {
    const source = createEvent({
      type: "order.created",
      payload: null,
      correlationId: "corr-1",
    });

    const derived = createDerivedEvent(source, {
      type: "order.processed",
      payload: null,
    });

    expect(derived.correlationId).toBe("corr-1");
    expect(derived.causationId).toBe(source.id);
  });

  it("should allow overriding correlation", () => {
    const source = createEvent({
      type: "a",
      payload: null,
      correlationId: "old",
    });

    const derived = createDerivedEvent(source, {
      type: "b",
      payload: null,
      correlationId: "new",
    });

    expect(derived.correlationId).toBe("new");
  });
});

// ─── Event type validation ──────────────────────────────

describe("isValidEventType", () => {
  it("should accept valid types", () => {
    expect(isValidEventType("user.created")).toBe(true);
    expect(isValidEventType("a")).toBe(true);
    expect(isValidEventType("database.connection.failed")).toBe(true);
    expect(isValidEventType("user_1.created")).toBe(true);
  });

  it("should reject invalid types", () => {
    expect(isValidEventType("")).toBe(false);
    expect(isValidEventType(" ")).toBe(false);
    expect(isValidEventType("User.Created")).toBe(false);
    expect(isValidEventType("user..created")).toBe(false);
    expect(isValidEventType(".user.created")).toBe(false);
    expect(isValidEventType("user.created.")).toBe(false);
    expect(isValidEventType("a".repeat(256))).toBe(false);
  });
});

describe("matchesEventType", () => {
  it("should match exact types", () => {
    expect(matchesEventType("user.created", "user.created")).toBe(true);
    expect(matchesEventType("user.created", "user.deleted")).toBe(false);
  });

  it("should match wildcard patterns", () => {
    expect(matchesEventType("user.created", "user.*")).toBe(true);
    expect(matchesEventType("user.deleted", "user.*")).toBe(true);
    expect(matchesEventType("order.created", "user.*")).toBe(false);
  });

  it("should match global wildcard", () => {
    expect(matchesEventType("anything", "*")).toBe(true);
  });
});

describe("normalizeEventType", () => {
  it("should normalize event types", () => {
    expect(normalizeEventType("User.Created")).toBe("user.created");
    expect(normalizeEventType("user/created")).toBe("user.created");
    expect(normalizeEventType("user..created")).toBe("user.created");
    expect(normalizeEventType("  user.created  ")).toBe("user.created");
  });
});

describe("createEventType", () => {
  it("should join segments with dots", () => {
    expect(createEventType("user", "created")).toBe("user.created");
  });

  it("should throw for empty segments", () => {
    expect(() => createEventType()).toThrow("segment");
  });
});

describe("getEventNamespace", () => {
  it("should return namespace", () => {
    expect(getEventNamespace("user.created")).toBe("user");
    expect(getEventNamespace("a")).toBe("a");
  });
});

describe("getEventAction", () => {
  it("should return action", () => {
    expect(getEventAction("user.created")).toBe("created");
    expect(getEventAction("a")).toBe("a");
  });
});

describe("getEventTypeSegments", () => {
  it("should split into segments", () => {
    expect(getEventTypeSegments("user.created")).toEqual(["user", "created"]);
  });
});

describe("createEventTypePattern", () => {
  it("should create namespace wildcard", () => {
    expect(createEventTypePattern("user")).toBe("user.*");
  });
});

describe("assertEventType", () => {
  it("should throw for invalid types", () => {
    expect(() => assertEventType("INVALID")).toThrow("Invalid event type");
  });

  it("should not throw for valid types", () => {
    expect(() => assertEventType("user.created")).not.toThrow();
  });
});

describe("tryNormalizeEventType", () => {
  it("should return normalized type", () => {
    expect(tryNormalizeEventType("User.Created")).toBe("user.created");
  });

  it("should return undefined for invalid", () => {
    expect(tryNormalizeEventType("")).toBeUndefined();
  });
});

describe("filterEventsByType", () => {
  it("should filter events by pattern", () => {
    const events = [
      createEvent({ type: "user.created", payload: null }),
      createEvent({ type: "order.created", payload: null }),
      createEvent({ type: "user.deleted", payload: null }),
    ];

    const filtered = filterEventsByType(events, "user.*");
    expect(filtered).toHaveLength(2);
  });
});

// ─── Event payload ──────────────────────────────────────

describe("isPrimitiveEventPayload", () => {
  it("should identify primitives", () => {
    expect(isPrimitiveEventPayload(null)).toBe(true);
    expect(isPrimitiveEventPayload(undefined)).toBe(true);
    expect(isPrimitiveEventPayload("hello")).toBe(true);
    expect(isPrimitiveEventPayload(42)).toBe(true);
    expect(isPrimitiveEventPayload(true)).toBe(true);
  });

  it("should reject objects", () => {
    expect(isPrimitiveEventPayload({})).toBe(false);
    expect(isPrimitiveEventPayload([])).toBe(false);
  });
});

describe("isObjectEventPayload", () => {
  it("should identify objects", () => {
    expect(isObjectEventPayload({ a: 1 })).toBe(true);
  });

  it("should reject non-objects", () => {
    expect(isObjectEventPayload(null)).toBe(false);
    expect(isObjectEventPayload([])).toBe(false);
    expect(isObjectEventPayload("string")).toBe(false);
  });
});

describe("isJsonEventPayload", () => {
  it("should identify JSON-compatible values", () => {
    expect(isJsonEventPayload(null)).toBe(true);
    expect(isJsonEventPayload("hello")).toBe(true);
    expect(isJsonEventPayload(42)).toBe(true);
    expect(isJsonEventPayload(true)).toBe(true);
    expect(isJsonEventPayload([1, 2, 3])).toBe(true);
    expect(isJsonEventPayload({ a: { b: 1 } })).toBe(true);
  });

  it("should reject non-JSON values", () => {
    expect(isJsonEventPayload(NaN)).toBe(false);
    expect(isJsonEventPayload(Infinity)).toBe(false);
    expect(isJsonEventPayload(Symbol("x"))).toBe(false);
  });
});

describe("createEventPayload", () => {
  it("should return payload unchanged by default", () => {
    const payload = { a: 1 };
    expect(createEventPayload(payload)).toBe(payload);
  });

  it("should strip undefined when requested", () => {
    const payload = { a: 1, b: undefined };
    const result = createEventPayload(payload, {
      stripUndefined: true,
    });
    expect(result).toEqual({ a: 1 });
  });
});

describe("deepFreeze", () => {
  it("should freeze objects deeply", () => {
    const obj = { a: { b: { c: 1 } } };
    const frozen = deepFreeze(obj);

    expect(Object.isFrozen(frozen)).toBe(true);
    expect(Object.isFrozen(frozen.a)).toBe(true);
    expect(Object.isFrozen(frozen.a.b)).toBe(true);
  });
});

describe("stripUndefinedValues", () => {
  it("should remove undefined properties", () => {
    const input = { a: 1, b: undefined, c: "hello" };
    expect(stripUndefinedValues(input)).toEqual({ a: 1, c: "hello" });
  });
});

describe("describeEventPayload", () => {
  it("should describe payload types", () => {
    expect(describeEventPayload(null)).toBe("null");
    expect(describeEventPayload([])).toBe("array");
    expect(describeEventPayload("hello")).toBe("string");
    expect(describeEventPayload(42)).toBe("number");
  });
});

// ─── Event description ──────────────────────────────────

describe("describeEvent", () => {
  it("should return type and id", () => {
    const event = createEvent({
      type: "user.created",
      payload: null,
      id: "evt-1",
    });
    expect(describeEvent(event)).toBe("user.created (evt-1)");
  });
});

describe("getEventType", () => {
  it("should return event type", () => {
    const event = createEvent({
      type: "test",
      payload: null,
    });
    expect(getEventType(event)).toBe("test");
  });
});

describe("getEventPayload", () => {
  it("should return event payload", () => {
    const event = createEvent({
      type: "test",
      payload: { data: 42 },
    });
    expect(getEventPayload(event)).toEqual({ data: 42 });
  });
});
