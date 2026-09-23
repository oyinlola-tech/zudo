import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { resolveProjectLayout } from "./layout/projectLayout.core.js";

/** Options for {@link findProjectRoot}. */
export interface FindProjectRootOptions {
  /**
   * Resolve an app inside a workspace to the workspace itself. Every
   * microservice app and a fullstack `apps/api` carries a `zudojs` block in
   * its own package.json, so the plain walk stops there and reports the app
   * as a stand-alone monolith with no manifest. With this set, an ancestor
   * holding `.zudojs/manifest.json` (or a legacy `zudojs.config.*`) wins.
   * `add`, `doctor` and `info` describe the whole project and use it;
   * `generate` and `build` keep working on the app they were run in.
   */
  readonly workspace?: boolean;
}

/** Whether `dir` holds the project's own record rather than an app's block. */
function holdsProjectRecord(dir: string): boolean {
  return ["zudojs.config.ts", "zudojs.config.js", join(".zudojs", "manifest.json")].some(
    (name) => existsSync(join(dir, name)),
  );
}

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
  options: FindProjectRootOptions = {},
): string | null {
  let dir = startDir;
  let nearest: string | null = null;

  while (true) {
    if (resolveProjectLayout(dir) !== null) {
      if (options.workspace !== true || holdsProjectRecord(dir)) return dir;
      nearest ??= dir;
    }

    const parent = dirname(dir);
    if (parent === dir) {
      return nearest;
    }
    dir = parent;
  }
}

export function resolveProjectPath(cwd: string, name: string): string {
  return join(cwd, name);
}
