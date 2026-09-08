import { describe, it, expect, vi } from "vitest";

import {
  EventRegistry,
  createEventRegistry,
} from "../src/eventRegistry/eventRegistry.store.js";

import { EventRegistryChangeType } from "../src/eventRegistry/eventRegistry.type.js";

import { createEvent, defineEvent } from "../src/eventTypes/eventDefinition.type.js";

import {
  DuplicateEventDefinitionError,
  DuplicateEventHandlerError,
  EventDefinitionNotFoundError,
  EventHandlerNotFoundError,
  EventRegistryDisposedError,
  InvalidEventError,
} from "../src/eventErrors/eventError.base.js";

describe("EventRegistry definitions", () => {
  it("registers, normalizes and looks up definitions consistently (EVENTS-11)", () => {
    const registry = createEventRegistry();
    const registered = registry.register(defineEvent("User.Created"));

    expect(registered.type).toBe("user.created");
    expect(registry.has("USER.CREATED")).toBe(true);
    expect(registry.get(" user.created ")?.type).toBe("user.created");
    expect(registry.require("user.created").definition.create({}).type).toBe(
      "user.created",
    );
    expect(registry.unregister("User.Created")).toBe(true);
    expect(registry.has("user.created")).toBe(false);
  });

  it("rejects duplicates unless allowed", () => {
    const registry = createEventRegistry();
    registry.register(defineEvent("a"));
    expect(() => registry.register(defineEvent("a"))).toThrow(
      DuplicateEventDefinitionError,
    );

    const lenient = createEventRegistry({ allowDuplicateDefinitions: true });
    lenient.register(defineEvent("a"));
    expect(() => lenient.register(defineEvent("a"))).not.toThrow();
  });

  it("rejects objects that are not definitions", () => {
    const registry = createEventRegistry();
    expect(() => registry.register({ type: "a" } as never)).toThrow(
      InvalidEventError,
    );
  });

  it("require throws EventDefinitionNotFoundError", () => {
    const registry = createEventRegistry();
    expect(() => registry.require("missing")).toThrow(
      EventDefinitionNotFoundError,
    );
  });
});

describe("EventRegistry handlers (EVENTS-09, EVENTS-10)", () => {
  it("tracks subscriptions and cancels them on dispose", () => {
    const registry = createEventRegistry();
    const sub = registry.registerHandler("a", () => {});

    expect(sub.active).toBe(true);
    registry.dispose();

    expect(sub.active).toBe(false);
    expect(() => sub.unsubscribe()).not.toThrow();
    expect(() => registry.getHandlers()).toThrow(EventRegistryDisposedError);
  });

  it("cancels subscriptions on clear", () => {
    const registry = createEventRegistry();
    const sub = registry.registerHandler("a", () => {});
    registry.clear();
    expect(sub.active).toBe(false);
    expect(registry.handlerCount).toBe(0);
  });

  it("throws on duplicate ids by default", () => {
    const registry = createEventRegistry();
    registry.registerHandler("a", () => {}, { id: "h" });
    expect(() => registry.registerHandler("a", () => {}, { id: "h" })).toThrow(
      DuplicateEventHandlerError,
    );
  });

  it("replace policy replaces without cross-unsubscribing", () => {
    const registry = createEventRegistry({ onDuplicateHandlerId: "replace" });
    const s1 = registry.registerHandler("a", () => {}, { id: "h" });
    const s2 = registry.registerHandler("a", () => {}, { id: "h" });

    expect(s1.active).toBe(false);
    expect(registry.handlerCount).toBe(1);
    s1.unsubscribe();
    expect(registry.handlerCount).toBe(1);
    expect(s2.active).toBe(true);
    expect(registry.getHandlerSubscription("h")).toBe(s2);
  });

  it("deprecated allowDuplicateHandlerIds maps to replace", () => {
    const registry = new EventRegistry({ allowDuplicateHandlerIds: true });
    registry.registerHandler("a", () => {}, { id: "h" });
    expect(() => registry.registerHandler("a", () => {}, { id: "h" })).not.toThrow();
    expect(registry.handlerCount).toBe(1);
  });

  it("unregisterHandler cancels the subscription and notifies once", () => {
    const registry = createEventRegistry();
    const changes: EventRegistryChangeType[] = [];
    registry.subscribe((c) => changes.push(c.type));

    const sub = registry.registerHandler("a", () => {}, { id: "h" });
    expect(registry.unregisterHandler("h")).toBe(true);
    expect(sub.active).toBe(false);
    expect(registry.unregisterHandler("h")).toBe(false);

    expect(changes).toEqual([
      EventRegistryChangeType.HANDLER_REGISTERED,
      EventRegistryChangeType.HANDLER_UNREGISTERED,
    ]);
  });

  it("requireHandler throws EventHandlerNotFoundError", () => {
    const registry = createEventRegistry();
    expect(() => registry.requireHandler("x")).toThrow(EventHandlerNotFoundError);
  });
});

describe("EventRegistry queries (EVENTS-25)", () => {
  it("returns enabled handlers sorted by priority for events and types", () => {
    const registry = createEventRegistry();
    registry.registerHandler("a.*", () => {}, { id: "low", priority: 1 });
    registry.registerHandler("a.b", () => {}, { id: "high", priority: 10 });
    registry.registerHandler("a.b", () => {}, { id: "off", enabled: false });

    const forEvent = registry.getHandlersForEvent(
      createEvent({ type: "a.b", payload: null }),
    );
    const forType = registry.getHandlersForType("A.B");

    expect(forEvent.map((h) => h.id)).toEqual(["high", "low"]);
    expect(forType.map((h) => h.id)).toEqual(["high", "low"]);
  });
});

describe("EventRegistry observers and limits (EVENTS-20, EVENTS-28)", () => {
  it("forwards observer failures to onError", () => {
    const onError = vi.fn();
    const registry = createEventRegistry({ onError });
    registry.subscribe(() => {
      throw new Error("observer boom");
    });

    registry.register(defineEvent("a"));

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]![1].source).toBe("observer");
  });

  it("warns when maxHandlersPerPattern is exceeded", () => {
    const onWarning = vi.fn();
    const registry = createEventRegistry({
      maxHandlersPerPattern: 1,
      onWarning,
    });
    registry.registerHandler("a", () => {});
    registry.registerHandler("a", () => {});
    registry.registerHandler("a", () => {});
    expect(onWarning).toHaveBeenCalledTimes(1);
  });

  it("validates maxHandlersPerPattern", () => {
    expect(() => createEventRegistry({ maxHandlersPerPattern: -1 })).toThrow(
      RangeError,
    );
  });
});
