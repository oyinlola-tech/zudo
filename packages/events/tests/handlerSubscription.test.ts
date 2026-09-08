import { describe, it, expect, vi } from "vitest";

import {
  createEventHandler,
  disableEventHandler,
  enableEventHandler,
  executeRegisteredEventHandler,
  getMatchingEventHandlers,
  onceEventHandler,
  prioritizedEventHandler,
  setEventHandlerPriority,
  sortEventHandlers,
  createEventHandlerContext,
} from "../src/eventHandler/eventHandler.core.js";

import {
  EventSubscriptionGroup,
  EventSubscriptionState,
  createEventSubscription,
  createEventSubscriptionGroup,
  isEventSubscription,
} from "../src/eventSubscription/eventSubscription.core.js";

import { createEvent } from "../src/eventTypes/eventDefinition.type.js";

import { EventTimeoutError } from "../src/eventErrors/eventError.base.js";

import * as events from "../src/index.js";

describe("createEventHandler (EVENTS-13, EVENTS-11)", () => {
  it("rejects non-finite priorities", () => {
    expect(() => createEventHandler(() => {}, { priority: NaN })).toThrow(
      RangeError,
    );
    expect(() => createEventHandler(() => {}, { priority: Infinity })).toThrow(
      RangeError,
    );
  });

  it("rejects invalid handlers, ids, patterns and timeouts", () => {
    expect(() => createEventHandler("x" as never)).toThrow(TypeError);
    expect(() => createEventHandler(() => {}, { id: "" })).toThrow(TypeError);
    expect(() =>
      createEventHandler(() => {}, { eventType: "a.*.b" as never }),
    ).toThrow(TypeError);
    expect(() => createEventHandler(() => {}, { timeoutMs: 0 })).toThrow(
      RangeError,
    );
  });

  it("normalizes the pattern", () => {
    expect(createEventHandler(() => {}, { eventType: " User.* " }).eventType).toBe(
      "user.*",
    );
    expect(createEventHandler(() => {}).eventType).toBe("*");
  });

  it("sorts by priority with registration order preserved", () => {
    const a = createEventHandler(() => {}, { id: "a", priority: 1 });
    const b = createEventHandler(() => {}, { id: "b", priority: 10 });
    const c = createEventHandler(() => {}, { id: "c", priority: 1 });
    expect(sortEventHandlers([a, b, c]).map((h) => h.id)).toEqual([
      "b",
      "a",
      "c",
    ]);
  });

  it("filters disabled handlers and non-matching patterns", () => {
    const on = createEventHandler(() => {}, { id: "on", eventType: "a.*" });
    const off = disableEventHandler(
      createEventHandler(() => {}, { id: "off", eventType: "a.b" }),
    );
    const other = createEventHandler(() => {}, { id: "x", eventType: "b" });
    const matching = getMatchingEventHandlers(
      [on, off, other],
      createEvent({ type: "a.b", payload: null }),
    );
    expect(matching.map((h) => h.id)).toEqual(["on"]);
    expect(enableEventHandler(off).enabled).toBe(true);
  });

  it("helper factories set their options", () => {
    expect(onceEventHandler("a", () => {}).once).toBe(true);
    expect(prioritizedEventHandler("a", 5, () => {}).priority).toBe(5);
    expect(setEventHandlerPriority(createEventHandler(() => {}), 3).priority).toBe(
      3,
    );
  });

  it("executeRegisteredEventHandler applies the timeout", async () => {
    const registration = createEventHandler(
      () => new Promise((resolve) => setTimeout(resolve, 50)),
      { timeoutMs: 5 },
    );
    const event = createEvent({ type: "a", payload: null });
    await expect(
      executeRegisteredEventHandler(
        registration,
        event,
        createEventHandlerContext(event),
      ),
    ).rejects.toBeInstanceOf(EventTimeoutError);
  });
});

describe("EventSubscription (EVENTS-26)", () => {
  it("is idempotent", () => {
    const onUnsubscribe = vi.fn();
    const sub = createEventSubscription(onUnsubscribe);
    sub.unsubscribe();
    sub.unsubscribe();
    expect(onUnsubscribe).toHaveBeenCalledTimes(1);
    expect(sub.state).toBe(EventSubscriptionState.CANCELLED);
    expect(isEventSubscription(sub)).toBe(true);
  });

  it("group unsubscribes everything and aggregates failures", () => {
    const ok = createEventSubscription(() => {});
    const bad = createEventSubscription(() => {
      throw new Error("bad");
    });
    const ok2 = createEventSubscription(() => {});
    const group = new EventSubscriptionGroup([ok, bad, ok2]);

    expect(() => group.unsubscribe()).toThrow(AggregateError);

    expect(ok.active).toBe(false);
    expect(ok2.active).toBe(false);
    expect(group.size).toBe(1);
    expect(group.active).toBe(true);
  });

  it("group cancels late additions once cancelled", () => {
    const group = createEventSubscriptionGroup();
    group.unsubscribe();
    const late = createEventSubscription(() => {});
    group.add(late);
    expect(late.active).toBe(false);
  });
});

describe("package exports (EVENTS-17)", () => {
  it("exposes the type and payload helpers from the root barrel", () => {
    const expected = [
      "matchesEventType",
      "getEventAction",
      "getEventTypeSegments",
      "isSameEventNamespace",
      "isChildEventType",
      "createEventTypePattern",
      "normalizeEventTypePattern",
      "defineEventTypes",
      "defineEventType",
      "eventMatchesType",
      "filterEventsByType",
      "tryNormalizeEventType",
      "assertEventType",
      "createObjectEventPayload",
      "createJsonEventPayload",
      "cloneEventPayload",
      "deepFreeze",
      "stripUndefinedValues",
      "mergeEventPayloads",
      "staticPayload",
      "definePayloadFactory",
      "describeEventPayload",
      "EventBusStoppedError",
      "EventBusDisposedError",
      "EventDispatchAbortedError",
      "isRegisteredEventMiddleware",
      "isEventEmitResult",
    ];

    for (const name of expected) {
      expect(typeof (events as Record<string, unknown>)[name], name).not.toBe(
        "undefined",
      );
    }
  });
});
