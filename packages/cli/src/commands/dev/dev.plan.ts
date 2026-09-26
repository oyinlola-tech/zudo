/**
 * zudojs-cli — Which development servers `zudojs dev` starts.
 *
 * Servers are started through the project's package manager (`pnpm run
 * dev`, `npm run dev`, …) rather than by spawning `tsx` or `ng` directly:
 * those binaries are devDependencies of the generated project and are not
 * on the user's PATH, so the direct spawn failed with ENOENT for everyone
 * who had not installed them globally. Running the script also means the
 * project's own `dev` script is what runs — `tsx watch src` used to be
 * hard-coded here, which watched `src/index.ts`, a file that only exports
 * `createApp` and never starts the server.
 */

import { existsSync } from "node:fs";
import { basename, join, relative } from "node:path";

import { getRunScriptCommand } from "../../installers/dependency.installer.js";
import type { ProjectLayout } from "../../resolvers/layout/projectLayout.core.js";

/** One development server to start. */
export interface DevServerSpec {
  readonly label: string;
  readonly cwd: string;
  readonly file: string;
  readonly args: readonly string[];
  readonly env?: NodeJS.ProcessEnv;
}

/** Which apps `zudojs dev` is asked to start. */
export interface DevSelection {
  readonly frontendOnly?: boolean;
  readonly backendOnly?: boolean;
  readonly port?: number;
}

/**
 * Computes the servers `zudojs dev` starts for a project layout.
 *
 * Exported so the selection can be tested without spawning anything.
 */
export function planDevServers(layout: ProjectLayout, options: DevSelection = {}): DevServerSpec[] {
  const servers: DevServerSpec[] = [];
  const env =
    options.port !== undefined
      ? { ...process.env, PORT: String(options.port) }
      : undefined;

  if (!options.frontendOnly) {
    for (const dir of layout.backendDirs) {
      if (!existsSync(join(dir, "package.json"))) continue;
      const [file, ...args] = getRunScriptCommand(layout.packageManager, "dev");
      servers.push({
        label: labelFor(layout.root, dir, "backend"),
        cwd: dir,
        file,
        args,
        ...(env ? { env } : {}),
      });
    }
  }

  if (!options.backendOnly && layout.frontendDir !== undefined) {
    const spec = frontendServer(layout, layout.frontendDir);
    if (spec) servers.push(spec);
  }

  return servers;
}

/**
 * Why {@link planDevServers} found nothing to start. `--frontend-only` in a
 * backend project used to warn and exit 0, which a script or CI step read
 * as "the dev server is up".
 */
export function describeNothingToStart(layout: ProjectLayout, options: DevSelection): string {
  if (options.frontendOnly && layout.frontendDir === undefined) {
    return `This ${layout.projectType} project has no frontend app, so --frontend-only has nothing to start. Run "zudojs dev" for the backend.`;
  }
  if (options.backendOnly && layout.backendDirs.length === 0) {
    return `This ${layout.projectType} project has no backend app, so --backend-only has nothing to start. Run "zudojs dev" for the frontend.`;
  }
  if (options.frontendOnly) {
    return "The frontend app has no package.json (or its framework has no dev server), so there is nothing to start.";
  }
  return "No development servers to start: no app in this project has a package.json with a dev script.";
}

function labelFor(root: string, dir: string, fallback: string): string {
  const rel = relative(root, dir);
  return rel === "" ? fallback : basename(dir);
}

function frontendServer(layout: ProjectLayout, dir: string): DevServerSpec | null {
  const framework = layout.frontendFramework ?? "react";

  if (framework === "none") return null;

  if (framework === "flutter") {
    if (!existsSync(join(dir, "pubspec.yaml"))) return null;
    return { label: "web", cwd: dir, file: "flutter", args: ["run", "--debug"] };
  }

  if (!existsSync(join(dir, "package.json"))) return null;

  // Angular's package.json has `start: ng serve`; React Native's has `start`.
  const script =
    framework === "angular" || framework === "react-native" ? "start" : "dev";
  const [file, ...args] = getRunScriptCommand(layout.packageManager, script);

  return { label: labelFor(layout.root, dir, "frontend"), cwd: dir, file, args };
}
