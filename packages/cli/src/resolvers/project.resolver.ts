import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Walks upward from `startDir` to the nearest directory that looks like a
 * project root: one holding a `.zudojs/manifest.json`, a legacy
 * `zudojs.config.ts`, or a `package.json`.
 */
export function findProjectRoot(
  startDir: string = process.cwd(),
): string | null {
  let dir = startDir;

  while (true) {
    if (
      existsSync(join(dir, ".zudojs", "manifest.json")) ||
      existsSync(join(dir, "zudojs.config.ts")) ||
      existsSync(join(dir, "package.json"))
    ) {
      return dir;
    }

    const parent = dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}

export function resolveProjectPath(cwd: string, name: string): string {
  return join(cwd, name);
}
