import { dirname, join } from "node:path";
import { resolveProjectLayout } from "./layout/projectLayout.core.js";

/**
 * Walks upward from `startDir` to the nearest directory that really is a
 * Zudojs project — one `resolveProjectLayout` recognizes: a
 * `.zudojs/manifest.json`, a legacy `zudojs.config.ts`/`.js`, or a `zudojs`
 * block in `package.json`.
 *
 * A bare `package.json` used to be accepted too, which made this a
 * "any JavaScript project" detector rather than a Zudojs one: run from a
 * directory with no Zudojs project anywhere, `zudojs build` climbed to an
 * unrelated ancestor `package.json` and ran its `scripts.build`.
 */
export function findProjectRoot(
  startDir: string = process.cwd(),
): string | null {
  let dir = startDir;

  while (true) {
    if (resolveProjectLayout(dir) !== null) {
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
