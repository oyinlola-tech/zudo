/**
 * @zudojs/events — Round 11 regression tests.
 */

import { describe, it, expect, vi } from "vitest";

import { createEventBus, createEventRegistry } from "../src/index.js";

import * as eventsApi from "../src/index.js";

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
  it("does not export a listener-limit error the package never throws", () => {
    expect(Object.keys(eventsApi)).not.toContain(
      "EventListenerLimitExceededError",
    );
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
