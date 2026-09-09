/**
 * zudojs-cli — Rollback Manager Tests
 *
 * Tests for RollbackManager.
 */

import { describe, it, expect } from "vitest";
import { RollbackManager } from "../src/rollback/rollbackManager.core.js";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("RollbackManager", () => {
  it("tracks files and directories", async () => {
    const manager = new RollbackManager();
    const tempDir = await mkdtemp(join(tmpdir(), "zudojs-rollback-"));

    const filePath = join(tempDir, "test.txt");
    await writeFile(filePath, "test");

    manager.trackFile(filePath);
    manager.trackDirectory(tempDir);

    expect(manager.entriesCount).toBe(2);
  });

  it("rolls back tracked files and directories", async () => {
    const manager = new RollbackManager();
    const tempDir = await mkdtemp(join(tmpdir(), "zudojs-rollback-"));

    const filePath = join(tempDir, "test.txt");
    await writeFile(filePath, "test");

    manager.trackFile(filePath);
    manager.trackDirectory(tempDir);

    await manager.rollback();

    expect(manager.entriesCount).toBe(0);
  });
});
