/**
 * zudojs-cli — Rollback Manager Tests
 *
 * Tests for RollbackManager.
 */

import { afterAll, describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { RollbackManager } from "../src/rollback/rollbackManager.core.js";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const created: string[] = [];

afterAll(async () => {
  await Promise.all(
    created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "zudojs-rollback-"));
  created.push(dir);
  return dir;
}

describe("RollbackManager", () => {
  it("tracks files and directories", async () => {
    const manager = new RollbackManager();
    const dir = await tempDir();

    const filePath = join(dir, "test.txt");
    await writeFile(filePath, "test");

    manager.trackFile(filePath);
    manager.trackDirectory(dir);

    expect(manager.entriesCount).toBe(2);
  });

  // This used to assert only that the entry list was emptied, which a
  // rollback whose whole body is `this.entries.length = 0` would pass.
  // What matters is that the files are gone.
  it("rolls back tracked files and directories", async () => {
    const manager = new RollbackManager();
    const dir = await tempDir();

    const filePath = join(dir, "test.txt");
    await writeFile(filePath, "test");

    manager.trackFile(filePath);
    manager.trackDirectory(dir);

    const result = await manager.rollback();

    expect(existsSync(filePath)).toBe(false);
    expect(existsSync(dir)).toBe(false);
    expect(result.failures).toEqual([]);
    expect(result.removed).toContain(dir);
    expect(manager.entriesCount).toBe(0);
  });
});
