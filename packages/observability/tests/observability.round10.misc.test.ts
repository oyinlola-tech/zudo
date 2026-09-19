import { describe, expect, it } from "vitest";
import {
  createMetricsRegistry,
  createObservability,
  fromLoggerLevel,
  LogLevel,
  redactValue,
  toLoggerLevel,
} from "../src/index.js";

describe("OBS-03", () => {
  it("keeps a __proto__ key as an own property instead of a prototype", () => {
    const input = JSON.parse('{"__proto__": {"isAdmin": true}, "user": "bob"}') as unknown;
    const out = redactValue(input) as Record<string, unknown>;
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect((out as { isAdmin?: unknown }).isAdmin).toBeUndefined();
    expect(Object.keys(out)).toEqual(["__proto__", "user"]);
    expect(JSON.stringify(out)).toBe('{"__proto__":{"isAdmin":true},"user":"bob"}');
  });
});

describe("OBS-04", () => {
  it("reports each rejected series once, even past the overflow cache", () => {
    let calls = 0;
    const reg = createMetricsRegistry({ maxSeries: 1, onCardinalityLimit: () => void calls++ });
    reg.counter("a").increment();
    for (let i = 0; i < 5; i++) reg.counter("req", { user: `u${i % 2}` }).increment();
    expect(calls).toBe(2);
    calls = 0;
    const reg2 = createMetricsRegistry({ maxSeries: 1, onCardinalityLimit: () => void calls++ });
    reg2.counter("a").increment();
    for (let i = 0; i < 2000; i++) reg2.counter("req", { user: `u${i}` }).increment();
    for (let i = 1500; i < 1600; i++) reg2.counter("req", { user: `u${i}` }).increment();
    expect(calls).toBe(2000);
  });

  it("the facade raises onError once per metric name", async () => {
    const errors: unknown[] = [];
    const obs = createObservability({
      serviceName: "t",
      useConsoleExporters: false,
      metrics: { maxSeries: 1 },
      onError: (e) => void errors.push(e),
    });
    obs.metrics.counter("a").increment();
    for (let i = 0; i < 50; i++) obs.metrics.counter("req", { user: `u${i}` }).increment();
    expect(errors).toHaveLength(1);
    await obs.shutdown();
  });
});

describe("XP-02", () => {
  it("converts between the inverted level scales", () => {
    expect(toLoggerLevel(LogLevel.FATAL)).toBe(0);
    expect(toLoggerLevel(LogLevel.ERROR)).toBe(1);
    expect(toLoggerLevel(LogLevel.TRACE)).toBe(5);
    expect(toLoggerLevel(LogLevel.OFF)).toBeUndefined();
    expect(fromLoggerLevel(0)).toBe(LogLevel.FATAL);
    expect(fromLoggerLevel(3)).toBe(LogLevel.INFO);
    expect(fromLoggerLevel(6)).toBeUndefined();
    for (const level of [0, 1, 2, 3, 4, 5]) expect(toLoggerLevel(fromLoggerLevel(level)!)).toBe(level);
  });
});
