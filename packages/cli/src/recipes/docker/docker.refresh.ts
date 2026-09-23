/**
 * zudojs-cli — Keeping CLI-written Dockerfiles in step with the app.
 *
 * A Dockerfile the CLI wrote for an app without Prisma cannot build it once
 * `zudojs add database` has run (the schema is needed before `prisma
 * generate`). A Dockerfile is rewritten only when it is byte-for-byte what
 * the CLI rendered for the other Prisma setting, so a hand-edited file is
 * never touched.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { renderAppPackageDockerfile } from "../../templates/shared/dockerfile.template.js";
import { writeFile } from "../../utils/utils.fileSystem.js";
import type { ProjectRecipeContext } from "../recipe.type.js";

/** Rewrites unedited CLI Dockerfiles whose Prisma setting is stale; returns their paths. */
export async function refreshGeneratedDockerfiles(
  context: ProjectRecipeContext,
): Promise<readonly string[]> {
  const refreshed: string[] = [];
  for (const app of context.apps) {
    const path = app.dir === "" ? "Dockerfile" : `${app.dir}/Dockerfile`;
    const fullPath = join(context.root, path);
    if (!existsSync(fullPath)) continue;
    const render = (prisma: boolean): string =>
      renderAppPackageDockerfile({
        appPath: app.dir === "" ? "." : app.dir,
        port: app.port,
        packageManager: context.packageManager,
        prisma,
      });
    const current = readFileSync(fullPath, "utf-8");
    const wanted = render(app.prisma);
    if (current !== wanted && current === render(!app.prisma)) {
      await writeFile(context.root, path, wanted);
      refreshed.push(path);
    }
  }
  return refreshed;
}
