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

  async rollback(): Promise<void> {
    for (const entry of [...this.entries].reverse()) {
      try {
        if (entry.type === "file" && existsSync(entry.path)) {
          await rm(entry.path);
        } else if (entry.type === "directory" && existsSync(entry.path)) {
          await rm(entry.path, { recursive: true, force: true });
        }
      } catch {
        // Best-effort rollback
      }
    }

    this.entries.length = 0;
  }

  get entriesCount(): number {
    return this.entries.length;
  }

  clear(): void {
    this.entries.length = 0;
  }
}
