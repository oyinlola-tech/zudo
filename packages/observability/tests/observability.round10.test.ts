import { describe, expect, it } from "vitest";
import {
  createObservability,
  createPropagationContext,
  createSpanContext,
  createChildSpanContext,
  createTracer,
  formatTraceparent,
  getCurrentContext,
  parseTraceparent,
  withSpan,
  type LogRecord,
  type ReadableSpan,
} from "../src/index.js";

const TRACE = "4bf92f3577b34da6a3ce929d0e0e4736";
const SPAN = "00f067aa0ba902b7";

describe("OBS-01", () => {
  it("spans join the ambient propagation context and logs line up", async () => {
    const logs: LogRecord[] = [];
    const spans: ReadableSpan[] = [];
    const obs = createObservability({
      serviceName: "t",
      useConsoleExporters: false,
      logExporter: { export: async (r) => void logs.push(...r), shutdown: async () => {} },
      spanExporter: { export: async (s) => void spans.push(...s), shutdown: async () => {} },
    });
    const ctx = createPropagationContext({ requestId: "r1" });
    await obs.propagation.run(ctx, async () => {
      obs.logger.info("handling");
      obs.tracer.startSpan("handle").end();
    });
    await obs.shutdown();
    expect(spans[0]?.context.traceId).toBe(logs[0]?.traceId);
    expect(spans[0]?.context.parentSpanId).toBe(ctx.spanId);
  });

  it("withSpan makes the span the active context and ends it", async () => {
    const tracer = createTracer();
    let inner: ReturnType<typeof getCurrentContext>;
    let child: ReturnType<typeof tracer.startSpan> | undefined;
    const span = await withSpan(tracer, "outer", async (s) => {
      inner = getCurrentContext();
      child = tracer.startSpan("child");
      child.end();
      return s;
    });
    expect(inner?.spanId).toBe(span.context.spanId);
    expect(child?.context.parentSpanId).toBe(span.context.spanId);
    expect(child?.context.traceId).toBe(span.context.traceId);
    expect(span.getDuration()).toBeGreaterThanOrEqual(0);
    expect(() =>
      tracer.startActiveSpan("boom", () => {
        throw new Error("x");
      }),
    ).toThrow("x");
  });
});

describe("OBS-02", () => {
  it("rejects invalid inbound IDs and starts a fresh trace", () => {
    const tracer = createTracer();
    const bad = { traceId: 'not-a-trace\n{"level":"fatal"}', spanId: "zz", traceFlags: 1 };
    const span = tracer.startSpan("child", { parent: bad });
    expect(span.context.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(span.context.parentSpanId).toBeUndefined();
    expect(createChildSpanContext(bad).parentSpanId).toBeUndefined();
    const prop = createPropagationContext({ traceId: "x", spanId: "", parentSpanId: "p" });
    expect(prop.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(prop.spanId).toMatch(/^[0-9a-f]{16}$/);
    expect(prop.parentSpanId).toBeUndefined();
    expect(createSpanContext({ traceId: "0".repeat(32) }).traceId).not.toBe("0".repeat(32));
  });

  it("keeps valid IDs", () => {
    const span = createTracer().startSpan("c", { parent: { traceId: TRACE, spanId: SPAN, traceFlags: 1 } });
    expect(span.context.traceId).toBe(TRACE);
    expect(span.context.parentSpanId).toBe(SPAN);
  });

  it("parses and formats traceparent strictly", () => {
    const header = `00-${TRACE}-${SPAN}-01`;
    expect(parseTraceparent(header)).toEqual({ traceId: TRACE, spanId: SPAN, traceFlags: 1 });
    expect(formatTraceparent({ traceId: TRACE, spanId: SPAN, traceFlags: 1 })).toBe(header);
    for (const bad of [
      undefined,
      "",
      `00-${TRACE.toUpperCase()}-${SPAN}-01`,
      `ff-${TRACE}-${SPAN}-01`,
      `00-${TRACE}-${SPAN}-01-extra`,
      `00-${"0".repeat(32)}-${SPAN}-01`,
      `00-${TRACE}-${"0".repeat(16)}-01`,
      `00-${TRACE}-${SPAN}-zz`,
    ]) {
      expect(parseTraceparent(bad)).toBeUndefined();
    }
    expect(parseTraceparent(`01-${TRACE}-${SPAN}-00-future`)?.traceId).toBe(TRACE);
    expect(formatTraceparent({ traceId: "x", spanId: SPAN })).toBeUndefined();
  });
});
