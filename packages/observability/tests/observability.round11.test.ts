/**
 * Audit round 11 regressions (API-03, API-04).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createObservability,
  createSpan,
  type LogRecord,
} from "../src/index.js";

describe("API-03 — a `__proto__` span attribute is stored, and the cap holds", () => {
  it("records an attribute named __proto__ instead of dropping it", () => {
    const span = createSpan("s");
    span.setAttribute("__proto__", { injected: true });
    span.setAttribute("ok", 1);
    span.end();

    const exported = span.toReadableSpan();
    expect(Object.keys(exported.attributes)).toContain("__proto__");
    expect(exported.attributes["__proto__"]).toEqual({ injected: true });
    expect(Object.getPrototypeOf(exported.attributes)).toBe(Object.prototype);
  });

  it("the same key inside an event is recorded, not swallowed", () => {
    // Exactly what instrumentation forwarding a decoded body hands over:
    // `JSON.parse` makes `__proto__` an own key.
    const body = JSON.parse('{"__proto__":{"injected":true},"ok":1}') as Record<
      string,
      unknown
    >;
    const span = createSpan("s");
    span.addEvent("decoded", body);
    span.end();

    const attributes = span.toReadableSpan().events[0]?.attributes ?? {};
    expect(Object.keys(attributes).sort()).toEqual(["__proto__", "ok"]);
    expect(attributes["__proto__"]).toEqual({ injected: true });
  });

  it("prototype injection cannot push the attribute count past maxAttributes", () => {
    const span = createSpan("s", { limits: { maxAttributes: 2 } });

    // The poisoned prototype used to answer `key in attributes` for every
    // one of its keys, so the cap check never fired for them.
    span.setAttribute("__proto__", { a: 1, b: 2, c: 3, d: 4, e: 5 });
    span.setAttribute("a", 1);
    span.setAttribute("b", 2);
    span.setAttribute("c", 3);
    span.setAttribute("d", 4);
    span.setAttribute("e", 5);
    span.end();

    const exported = span.toReadableSpan();
    expect(Object.keys(exported.attributes).length).toBeLessThanOrEqual(2);
    expect(exported.droppedAttributes).toBeGreaterThan(0);
  });

  it("inherited Object.prototype names do not bypass the cap either", () => {
    const span = createSpan("s", { limits: { maxAttributes: 1 } });
    span.setAttribute("first", 1);
    span.setAttribute("toString", "x");
    span.setAttribute("valueOf", "y");
    span.end();

    const exported = span.toReadableSpan();
    expect(Object.keys(exported.attributes)).toEqual(["first"]);
    expect(exported.droppedAttributes).toBe(2);
  });
});

describe("API-04 — queue-overflow reports are rate limited", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const droppedIn = (message: string): number =>
    Number(/Dropped (\d+) log records/.exec(message)?.[1]);

  it("a stalled exporter produces one drop report, not one per record", async () => {
    let clock = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => clock);

    let release: (() => void) | undefined;
    const stalled = new Promise<void>((resolve) => {
      release = resolve;
    });
    const reports: string[] = [];

    const obs = createObservability({
      serviceName: "t",
      useConsoleExporters: false,
      logExporter: {
        export: async (_records: readonly LogRecord[]) => stalled,
        shutdown: async () => {},
      },
      spanExporter: { export: async () => {}, shutdown: async () => {} },
      onError: (error, source) => {
        if (source === "BatchLogProcessor") {
          reports.push((error as Error).message);
        }
      },
    });

    for (let i = 0; i < 10_000; i += 1) obs.logger.info(`m${i}`);

    expect(reports.length).toBe(1);

    // Still nothing more inside the interval, however many records are lost.
    for (let i = 0; i < 10_000; i += 1) obs.logger.info(`n${i}`);
    expect(reports.length).toBe(1);

    // Past the interval, one summary carrying the running total.
    clock += 61_000;
    obs.logger.info("after");
    expect(reports.length).toBe(2);
    expect(droppedIn(reports[1]!)).toBeGreaterThan(droppedIn(reports[0]!));
    expect(droppedIn(reports[1]!)).toBeGreaterThan(10_000);

    release?.();
    await obs.shutdown();
  });
});
