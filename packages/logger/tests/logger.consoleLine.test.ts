import { afterEach, describe, expect, it, vi } from "vitest";

import { createConsoleLoggerTransport, createLogger, LoggerLevel } from "../src/index.js";

afterEach(() => {
  vi.restoreAllMocks();
});

function capture(): { readonly lines: unknown[] } {
  const lines: unknown[] = [];
  for (const method of ["info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, method).mockImplementation((value: unknown) => {
      lines.push(value);
    });
  }
  return { lines };
}

describe("console transport output", () => {
  it("prints the formatted line once, not a record repeating timestamp and level", async () => {
    const { lines } = capture();
    const logger = createLogger({
      name: "svc",
      transports: [createConsoleLoggerTransport()],
    });
    logger.warn("careful", { userId: "u1" });
    await logger.flush();

    expect(lines).toHaveLength(1);
    expect(typeof lines[0]).toBe("string");
    expect(lines[0]).toMatch(/^\d{4}-\d\d-\d\dT[\d:.]+Z \[WARN\] \[svc\] careful userId=u1$/);
  });

  it("keeps an Error passed as the second argument, with its stack", async () => {
    const { lines } = capture();
    const logger = createLogger({
      name: "svc",
      transports: [createConsoleLoggerTransport()],
    });
    // JavaScript callers pass the caught error where metadata goes.
    logger.error("failed", new Error("boom") as unknown as Record<string, never>);
    await logger.flush();

    const line = String(lines[0]);
    expect(line).toMatch(/\[ERROR\] \[svc\] failed\nError: boom\n/);
    expect(line).not.toMatch(/failed \n/);
  });
});

describe("level method signatures", () => {
  it("logs an Error together with metadata through log()", async () => {
    const { lines } = capture();
    const logger = createLogger({
      name: "svc",
      transports: [createConsoleLoggerTransport()],
    });
    logger.log(LoggerLevel.ERROR, "payment failed", {
      error: new Error("card declined"),
      metadata: { orderId: "o1" },
    });
    await logger.flush();
    expect(String(lines[0])).toMatch(/\[ERROR\] \[svc\] payment failed orderId=o1\nError: card declined\n/);
  });

  it("still satisfies a structural logger type taking a context record", () => {
    const accept = (l: { warn(message: string, context?: Record<string, unknown>): void }) => l;
    expect(accept(createLogger({ name: "svc" }))).toBeDefined();
  });
});
