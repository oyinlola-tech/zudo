/**
 * zudojs-cli — Rollback System
 *
 * Tracks generation operations and supports rollback on failure.
 */

import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";

export interface RollbackEntry {
  readonly type: "file" | "directory" | "command";
  readonly path: string;
  readonly timestamp: number;
}

/** One entry that could not be removed, with the reason. */
export interface RollbackFailure {
  readonly path: string;
  readonly reason: string;
}

/** What a rollback actually managed to undo. */
export interface RollbackResult {
  readonly removed: readonly string[];
  readonly failures: readonly RollbackFailure[];
}

export class RollbackManager {
  private readonly entries: RollbackEntry[] = [];

  trackFile(path: string): void {
    this.entries.push({
      type: "file",
      path,
      timestamp: Date.now(),
    });
  }

  trackDirectory(path: string): void {
    this.entries.push({
      type: "directory",
      path,
      timestamp: Date.now(),
    });
  }

  /**
   * Removes every tracked path, newest first.
   *
   * Failures used to be swallowed and the entry list cleared regardless, so
   * a half-created project stayed on disk with nothing left to retry and
   * nothing said about it. Entries that could not be removed are kept, and
   * the caller is handed the paths so it can name them.
   */
  async rollback(): Promise<RollbackResult> {
    const removed: string[] = [];
    const failures: RollbackFailure[] = [];
    const remaining: RollbackEntry[] = [];

    for (const entry of [...this.entries].reverse()) {
      try {
        if (entry.type === "file" && existsSync(entry.path)) {
          await rm(entry.path);
          removed.push(entry.path);
        } else if (entry.type === "directory" && existsSync(entry.path)) {
          await rm(entry.path, { recursive: true, force: true });
          removed.push(entry.path);
        }
      } catch (error) {
        failures.push({
          path: entry.path,
          reason: error instanceof Error ? error.message : String(error),
        });
        remaining.push(entry);
      }
    }

    this.entries.length = 0;
    this.entries.push(...remaining);

    return { removed, failures };
  }

  get entriesCount(): number {
    return this.entries.length;
  }

  clear(): void {
    this.entries.length = 0;
  }
}
