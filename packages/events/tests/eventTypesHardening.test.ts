import { describe, it, expect } from "vitest";

import { createEvent, defineEvent } from "../src/eventTypes/eventDefinition.type.js";

import {
  isValidEventType,
  isValidEventTypePattern,
  matchesEventType,
  normalizeEventTypePattern,
} from "../src/eventTypes/eventType.type.js";

import {
  deepFreeze,
  isJsonEventPayload,
  createJsonEventPayload,
} from "../src/eventTypes/eventPayload.type.js";

import { InvalidEventError } from "../src/eventErrors/eventError.base.js";

describe("createEvent validation (EVENTS-21, EVENTS-16)", () => {
  it("normalizes the type", () => {
    expect(createEvent({ type: " User.Created ", payload: 1 }).type).toBe(
      "user.created",
    );
  });

  it("throws InvalidEventError for invalid types", () => {
    expect(() => createEvent({ type: "", payload: 1 })).toThrow(InvalidEventError);
    expect(() => createEvent({ type: "a".repeat(300), payload: 1 })).toThrow(
      InvalidEventError,
    );
    expect(() => createEvent({ type: "user.*", payload: 1 })).toThrow(
      InvalidEventError,
    );
  });

  it("rejects invalid Date timestamps", () => {
    expect(() =>
      createEvent({ type: "a", payload: 1, timestamp: new Date("nope") }),
    ).toThrow(InvalidEventError);
  });

  it("defineEvent normalizes and validates", () => {
    expect(defineEvent("User.Created").type).toBe("user.created");
    expect(() => defineEvent("")).toThrow(InvalidEventError);
  });
});

describe("event type patterns (EVENTS-24)", () => {
  it("does not accept wildcards inside event types", () => {
    expect(isValidEventType("user.*")).toBe(false);
    expect(isValidEventType("user.cre*")).toBe(false);
    expect(isValidEventTypePattern("user.*.created")).toBe(false);
    expect(isValidEventTypePattern("user.*")).toBe(true);
    expect(isValidEventTypePattern("*")).toBe(true);
  });

  it("normalizes patterns", () => {
    expect(normalizeEventTypePattern("*")).toBe("*");
    expect(normalizeEventTypePattern(" User.* ")).toBe("user.*");
    expect(normalizeEventTypePattern("User.Created")).toBe("user.created");
  });

  it("namespace patterns match children and the bare namespace", () => {
    expect(matchesEventType("user.created", "user.*")).toBe(true);
    expect(matchesEventType("user", "user.*")).toBe(true);
    expect(matchesEventType("order.created", "user.*")).toBe(false);
  });
});

describe("payload guards (EVENTS-12)", () => {
  it("deepFreeze handles cycles and already-frozen parents", () => {
    const a: Record<string, unknown> = { name: "a" };
    const b: Record<string, unknown> = { a };
    a.b = b;

    expect(() => deepFreeze(a)).not.toThrow();
    expect(Object.isFrozen(a)).toBe(true);
    expect(Object.isFrozen(b)).toBe(true);

    const frozenParent = Object.freeze({ child: { x: 1 } });
    deepFreeze(frozenParent);
    expect(Object.isFrozen(frozenParent.child)).toBe(true);
  });

  it("deepFreeze leaves typed arrays alone", () => {
    const payload = { bytes: new Uint8Array([1, 2]) };
    expect(() => deepFreeze(payload)).not.toThrow();
    expect(Object.isFrozen(payload)).toBe(true);
  });

  it("isJsonEventPayload rejects cycles and non-plain objects", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;

    expect(isJsonEventPayload(cyclic)).toBe(false);
    expect(isJsonEventPayload(new Date())).toBe(false);
    expect(isJsonEventPayload(new Map())).toBe(false);
    expect(isJsonEventPayload(new (class X {})())).toBe(false);
    expect(isJsonEventPayload({ a: [1, "b", null, { c: true }] })).toBe(true);
    expect(isJsonEventPayload(Object.create(null))).toBe(true);
    expect(() => createJsonEventPayload(cyclic as never)).toThrow(TypeError);
  });
});
