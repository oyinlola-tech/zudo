/**
 * Round 12 (academy findings) — @zudojs/observability.
 *
 * #123 Log records carried `traceId`/`spanId` from the ambient
 *      PropagationContext but dropped its `requestId` and `correlationId`,
 *      so a request-scoped log line could not be joined to the request
 *      without re-attaching the ids by hand.
 */

import { describe, expect, it } from "vitest";

import {
  createConsoleLogExporter,
  createPropagationContext,
  createPropagationManager,
  createStructuredLogger,
} from "../src/index.js";
import type { LogRecord } from "../src/index.js";

function memoryLogger(options?: { readonly correlate?: boolean }): {
  readonly records: LogRecord[];
  readonly logger: ReturnType<typeof createStructuredLogger>;
} {
  const records: LogRecord[] = [];
  const logger = createStructuredLogger({
    name: "t",
    transport: { name: "memory", write: (record) => void records.push(record) },
    ...options,
  });
  return { records, logger };
}

describe("#123 log records carry requestId and correlationId", () => {
  it("stamps both ids from the active propagation context", async () => {
    const { records, logger } = memoryLogger();
    const propagation = createPropagationManager();
    const context = createPropagationContext({
      requestId: "req_17",
      correlationId: "corr_9",
    });

    await propagation.run(context, async () => logger.info("handling"));

    expect(records[0]).toMatchObject({
      traceId: context.traceId,
      spanId: context.spanId,
      requestId: "req_17",
      correlationId: "corr_9",
    });
  });

  it("leaves them undefined when the context has none, or outside a context", async () => {
    const { records, logger } = memoryLogger();
    const propagation = createPropagationManager();

    await propagation.run(createPropagationContext(), async () =>
      logger.info("bare"),
    );
    logger.info("outside");

    expect(records[0]?.traceId).toBeDefined();
    expect(records[0]?.requestId).toBeUndefined();
    expect(records[0]?.correlationId).toBeUndefined();
    expect(records[1]?.traceId).toBeUndefined();
    expect(records[1]?.requestId).toBeUndefined();
  });

  it("respects correlate: false for the new ids too", async () => {
    const { records, logger } = memoryLogger({ correlate: false });
    const propagation = createPropagationManager();

    await propagation.run(
      createPropagationContext({ requestId: "req_1", correlationId: "c_1" }),
      async () => logger.info("uncorrelated"),
    );

    expect(records[0]?.traceId).toBeUndefined();
    expect(records[0]?.requestId).toBeUndefined();
    expect(records[0]?.correlationId).toBeUndefined();
  });

  it("propagates through child loggers", async () => {
    const { records, logger } = memoryLogger();
    const child = logger.child("orders", { tenant: "acme" });
    const propagation = createPropagationManager();

    await propagation.run(
      createPropagationContext({ requestId: "req_2" }),
      async () => child.warn("slow"),
    );

    expect(records[0]).toMatchObject({
      loggerName: "t.orders",
      context: { tenant: "acme" },
      requestId: "req_2",
    });
  });

  it("is written by the console log exporter", async () => {
    const lines: string[] = [];
    const exporter = createConsoleLogExporter({
      console: {
        log: (line: string) => void lines.push(line),
        warn: (line: string) => void lines.push(line),
        error: (line: string) => void lines.push(line),
      },
    });
    const { records, logger } = memoryLogger();
    const propagation = createPropagationManager();
    await propagation.run(
      createPropagationContext({ requestId: "req_3", correlationId: "c_3" }),
      async () => logger.info("exported"),
    );

    await exporter.export(records);

    expect(JSON.parse(lines[0] ?? "{}")).toMatchObject({
      message: "exported",
      requestId: "req_3",
      correlationId: "c_3",
    });
  });
});
