/**
 * @zudojs/database — Round 10 phase 2 regressions (cross-package handoffs).
 */

import { afterEach, describe, it, expect, vi } from "vitest";
import { createLogger, LoggerLevel } from "@zudojs/logger";
import type { LoggerEntry } from "@zudojs/logger";

import {
  createDatabaseLoggerAdapter,
  createDefaultLogger,
} from "../src/databaseClient/databaseClient.logger.js";
import { toPrismaWhere } from "../src/index.js";

async function tick(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

describe("INF-18 (default logger goes through @zudojs/logger)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("writes structured, redacted entries instead of raw console arguments", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    createDefaultLogger().warn("slow query", { password: "hunter2", ms: 900 });
    await tick();
    expect(warn).toHaveBeenCalledTimes(1);
    // The console transport prints the formatted line (it used to print a
    // record object that repeated the timestamp and level).
    const [payload] = warn.mock.calls[0] ?? [];
    expect(payload).toEqual(expect.stringContaining("[WARN]"));
    expect(payload).toEqual(expect.stringContaining("slow query"));
    expect(payload).toEqual(expect.stringContaining("password=[REDACTED]"));
    expect(payload).toEqual(expect.stringContaining("ms=900"));
    expect(JSON.stringify(warn.mock.calls)).not.toContain("hunter2");
  });

  it("still drops debug/info in production, checked per call", async () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined);
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const logger = createDefaultLogger();
    vi.stubEnv("NODE_ENV", "production");
    logger.debug("hidden");
    logger.info("hidden");
    vi.stubEnv("NODE_ENV", "development");
    logger.debug("shown");
    await tick();
    expect(info).not.toHaveBeenCalled();
    expect(debug).toHaveBeenCalledTimes(1);
  });

  it("passes Error instances as the entry error and other values as metadata", async () => {
    const entries: LoggerEntry[] = [];
    const adapter = createDatabaseLoggerAdapter(
      createLogger({
        level: LoggerLevel.DEBUG,
        transports: [(entry: LoggerEntry) => void entries.push(entry)],
      }),
    );
    const failure = new Error("boom");
    adapter.error("query failed", failure, { model: "User" });
    adapter.error("odd failure", "string reason");
    await tick();
    expect(entries[0]?.error).toBe(failure);
    expect(entries[0]?.metadata).toMatchObject({ model: "User" });
    expect(entries[1]?.metadata).toMatchObject({ error: "string reason" });
  });
});

describe("LEAF-08 (shared isPlainObject in toPrismaWhere)", () => {
  class Decimal {
    constructor(readonly d: number) {}
  }

  it("merges operators on one field and keeps class-instance values intact", () => {
    const low = new Decimal(1);
    const high = new Decimal(9);
    const when = new Date(0);
    const where = toPrismaWhere({
      conditions: [
        { field: "price", operator: "gt", value: low },
        { field: "price", operator: "lt", value: high },
        { field: "at", operator: "gte", value: when },
      ],
    } as Parameters<typeof toPrismaWhere>[0]);
    expect(where?.["price"]).toEqual({ gt: low, lt: high });
    const price = where?.["price"] as { gt: unknown; lt: unknown };
    expect(price.gt).toBe(low);
    expect(price.lt).toBe(high);
    expect((where?.["at"] as { gte: unknown }).gte).toBe(when);
  });
});
