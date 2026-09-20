import { existsSync, readFileSync, realpathSync } from "node:fs";
import { mkdir, writeFile as writeFileAsync } from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";

import { activeWriteCapture } from "./utils.writeGuard.js";

/**
 * Resolves `path` through symlinks as far as it exists on disk, keeping the
 * components that do not exist yet verbatim.
 *
 * Containment cannot be decided on the literal string alone: `mkdir` with
 * `recursive: true` is a no-op on an existing directory, so if a component of
 * the path is a symlink the write follows it to wherever it points. Only the
 * real path of the deepest existing ancestor answers where the bytes land.
 */
function realizePath(path: string): string {
  const absolute = resolve(path);
  const tail: string[] = [];
  let current = absolute;

  for (;;) {
    try {
      const real = realpathSync(current);
      return tail.length === 0 ? real : join(real, ...tail);
    } catch {
      const parent = dirname(current);
      // Reached the filesystem root without finding anything that exists.
      if (parent === current) return absolute;
      tail.unshift(basename(current));
      current = parent;
    }
  }
}

/** Whether `target` is `base` itself or lives underneath it. */
function isContained(base: string, target: string): boolean {
  if (base === target) return true;
  const relativePath = relative(base, target);
  return (
    relativePath !== "" &&
    !isAbsolute(relativePath) &&
    !relativePath.startsWith(`..${sep}`) &&
    relativePath !== ".."
  );
}

function assertSafePath(basePath: string, filePath: string): void {
  const resolved = join(basePath, filePath);
  const relativePath = relative(basePath, resolved);

  if (relativePath.startsWith("..") || relativePath.includes("..")) {
    throw new Error(`Path traversal detected: ${filePath}`);
  }

  // Re-assert containment against what is actually on disk, so a symlinked
  // directory inside the project cannot carry the write outside it.
  if (!isContained(realizePath(basePath), realizePath(resolved))) {
    throw new Error(
      `Path escapes the project through a symlink: ${filePath}. ` +
        `Replace the symlinked directory with a real one, or generate into a different path.`,
    );
  }
}

export async function writeFile(
  basePath: string,
  filePath: string,
  content: string,
): Promise<void> {
  assertSafePath(basePath, filePath);

  const fullPath = join(basePath, filePath);
  const capture = activeWriteCapture();
  if (capture) {
    capture.set(fullPath, content);
    return;
  }
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFileAsync(fullPath, content);
}

export async function writeFileTree(
  basePath: string,
  files: Readonly<Record<string, string>>,
): Promise<void> {
  for (const [filePath, content] of Object.entries(files)) {
    await writeFile(basePath, filePath, content);
  }
}

/**
 * Returns the content of a barrel index file with `exportLine` appended,
 * preserving any existing exports. If the line is already present, the
 * existing content is returned unchanged.
 */
export function mergeBarrelExport(
  basePath: string,
  indexPath: string,
  exportLine: string,
): string {
  const fullPath = join(basePath, indexPath);
  const line = exportLine.trim();

  let existing = "";
  if (existsSync(fullPath)) {
    existing = readFileSync(fullPath, "utf-8");
  }

  if (existing.includes(line)) {
    return existing;
  }

  const separator = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
  return existing + separator + line + "\n";
}
