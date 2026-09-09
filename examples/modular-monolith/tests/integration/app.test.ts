import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { App } from "../../src/app.js";

/**
 * Boots the example application end to end.
 *
 * The point of this suite is that the example actually composes: a
 * developer copying this template should find out here, not at runtime,
 * if wiring a module into the loaders was left half-done.
 */
describe("modular monolith application", () => {
  let app: App;
  let dataDir: string;

  beforeAll(async () => {
    // createApp() opens a real SQLite file. Point it at a throwaway
    // directory so the suite never touches ./data/community.db.
    dataDir = mkdtempSync(join(tmpdir(), "zudo-monolith-"));
    process.env["DATABASE_FILENAME"] = join(dataDir, "test.db");

    const { createApp } = await import("../../src/app.js");
    app = await createApp();
  });

  afterAll(async () => {
    await app?.stop();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("exposes a command bus and a query bus", () => {
    expect(app.commandBus).toBeDefined();
    expect(app.queryBus).toBeDefined();
  });

  it("registers handlers on both buses", () => {
    expect(app.commandBus.size()).toBeGreaterThan(0);
    expect(app.queryBus.size()).toBeGreaterThan(0);
  });

  it("registers every command type exactly once", () => {
    const types = app.commandBus.getCommandTypes();

    expect(new Set(types).size).toBe(types.length);
  });

  it("starts and stops without throwing", async () => {
    await expect(app.start()).resolves.toBeUndefined();
  });
});
