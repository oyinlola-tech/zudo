/**
 * @zudojs/events — Round 11 regression tests.
 */

import { describe, it, expect, vi } from "vitest";

import { createEventBus, createEventRegistry } from "../src/index.js";

import * as eventsApi from "../src/index.js";

import * as errorsApi from "@zudojs/errors";

describe("MSG-E-01", () => {
  it("hands handlers a frozen copy and leaves the publisher's payload mutable", async () => {
    const bus = createEventBus();
    const payload = { count: 1 };
    let seenFrozen = false;

    bus.on("doc.claim", (event) => {
      seenFrozen = Object.isFrozen(
        (event.payload as { readonly inner: unknown }).inner,
      );
    });

    await bus.publishEvent({ type: "doc.claim", payload: { inner: payload } });

    expect(seenFrozen).toBe(true);
    expect(Object.isFrozen(payload)).toBe(false);
    payload.count = 2;
    expect(payload.count).toBe(2);
    bus.dispose();
  });
});

describe("MSG-E-02", () => {
  it("re-exports the listener-limit error from @zudojs/errors", () => {
    expect(Object.keys(eventsApi)).toContain("EventListenerLimitExceededError");
    expect(eventsApi.EventListenerLimitExceededError).toBe(
      errorsApi.EventListenerLimitExceededError,
    );
  });

  it("throws the listener-limit error when the limit is enforced", () => {
    const registry = createEventRegistry({
      maxHandlersPerPattern: 1,
      enforceHandlerLimit: true,
    });

    registry.registerHandler("limit.enforced", () => {});

    let thrown: unknown;

    try {
      registry.registerHandler("limit.enforced", () => {});
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(errorsApi.EventListenerLimitExceededError);

    const error = thrown as InstanceType<
      typeof errorsApi.EventListenerLimitExceededError
    >;

    expect(error.pattern).toBe("limit.enforced");
    expect(error.limit).toBe(1);
    expect(error.count).toBe(2);
    expect(error.expose).toBe(false);
  });

  it("leaves the registry unchanged when a registration is refused", () => {
    const registry = createEventRegistry({
      maxHandlersPerPattern: 1,
      enforceHandlerLimit: true,
    });

    registry.registerHandler("limit.rollback", () => {});

    expect(() =>
      registry.registerHandler("limit.rollback", () => {}),
    ).toThrow();

    expect(registry.getHandlersForType("limit.rollback")).toHaveLength(1);
  });

  it("reports exceeding maxHandlersPerPattern as a warning, not an error", () => {
    const warnings: string[] = [];
    const registry = createEventRegistry({
      maxHandlersPerPattern: 1,
      onWarning: (warning) => warnings.push(warning.type),
    });

    registry.registerHandler("limit.test", () => {});
    expect(() =>
      registry.registerHandler("limit.test", () => {}),
    ).not.toThrow();
    expect(warnings).toEqual(["handler.limit"]);
    registry.dispose();
  });
});

describe("MSG-E-03", () => {
  it("reports a throwing bus observer through process.emitWarning by default", async () => {
    const emitWarning = vi
      .spyOn(process, "emitWarning")
      .mockImplementation(() => {});
    try {
      const bus = createEventBus();
      const other: string[] = [];
      bus.subscribe(() => {
        throw new Error("broken audit sink");
      });
      bus.subscribe(() => {
        other.push("second-observer-ran");
      });
      bus.on("obs.test", () => {});

      await bus.publishEvent({ type: "obs.test", payload: {} });

      await bus.publishEvent({ type: "obs.test", payload: {} });

      expect(other.length).toBeGreaterThan(0);
      const messages = emitWarning.mock.calls.map((call) => String(call[0]));
      expect(
        messages.filter((message) => message.includes("broken audit sink")),
      ).toHaveLength(1);
      const options = emitWarning.mock.calls.at(-1)?.[1] as {
        readonly code?: string;
        readonly type?: string;
      };
      expect(options?.type).toBe("ZudojsEventsWarning");
      expect(options?.code).toBe("ZUDOJS_EVENTS_OBSERVER_ERROR");
      bus.dispose();
    } finally {
      emitWarning.mockRestore();
    }
  });

  it("reports a throwing registry observer through process.emitWarning by default", () => {
    const emitWarning = vi
      .spyOn(process, "emitWarning")
      .mockImplementation(() => {});
    try {
      const registry = createEventRegistry();
      registry.subscribe(() => {
        throw new Error("broken registry observer");
      });

      registry.registerHandler("registry.obs", () => {});

      const messages = emitWarning.mock.calls.map((call) => String(call[0]));
      expect(
        messages.some((message) =>
          message.includes("broken registry observer"),
        ),
      ).toBe(true);
      registry.dispose();
    } finally {
      emitWarning.mockRestore();
    }
  });

  it("still prefers a configured onError hook over the warning channel", async () => {
    const emitWarning = vi
      .spyOn(process, "emitWarning")
      .mockImplementation(() => {});
    try {
      const seen: unknown[] = [];
      const bus = createEventBus({
        onError: (error) => seen.push(error),
      });
      bus.subscribe(() => {
        throw new Error("handled elsewhere");
      });
      bus.on("obs.hook", () => {});

      await bus.publishEvent({ type: "obs.hook", payload: {} });

      expect(seen.length).toBeGreaterThan(0);
      const messages = emitWarning.mock.calls.map((call) => String(call[0]));
      expect(
        messages.some((message) => message.includes("handled elsewhere")),
      ).toBe(false);
      bus.dispose();
    } finally {
      emitWarning.mockRestore();
    }
  });
});
