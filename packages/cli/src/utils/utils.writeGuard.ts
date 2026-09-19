/**
 * zudojs-cli — Refusing to overwrite user files.
 *
 * Every schematic wrote with an unconditional `writeFile`, so re-running
 * `zudojs generate module billing` (or reusing a name by mistake) replaced
 * hand-written `*.module.ts`, `*.service.ts` and handler files without a
 * word. `zudojs generate` now runs the schematic once with its writes
 * captured, checks the captured files against the disk, and only then
 * writes. An existing file may only be left as it is or appended to (the
 * barrel merge done by `mergeBarrelExport`); anything else is a conflict
 * unless `--force` is passed.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { existsSync, readFileSync } from "node:fs";
import { relative } from "node:path";

const captured = new AsyncLocalStorage<Map<string, string>>();

/** The capture map of the current `captureWrites` call, if any. */
export function activeWriteCapture(): Map<string, string> | undefined {
  return captured.getStore();
}

/**
 * Runs `run` with every `writeFile`/`writeFileTree` recorded instead of
 * written. Returns the absolute paths and contents that would be written.
 */
export async function captureWrites(
  run: () => Promise<unknown>,
): Promise<ReadonlyMap<string, string>> {
  const files = new Map<string, string>();
  await captured.run(files, run);
  return files;
}

/**
 * Lists captured files that already exist and would be changed other than
 * by appending (paths relative to `cwd`).
 */
export function findWriteConflicts(
  cwd: string,
  files: ReadonlyMap<string, string>,
): string[] {
  const conflicts: string[] = [];
  for (const [path, content] of files) {
    if (!existsSync(path)) continue;
    const existing = readFileSync(path, "utf-8");
    if (content === existing || content.startsWith(existing)) continue;
    conflicts.push(relative(cwd, path));
  }
  return conflicts;
}
