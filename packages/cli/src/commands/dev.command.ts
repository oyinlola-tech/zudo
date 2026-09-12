/**
 * zudojs-cli — Dev Command
 *
 * The `zudojs dev` command. Starts the development servers of the project
 * in the current directory.
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
import { runStreaming } from "../utils/utils.exec.js";
import type { CLIContext } from "../cliType/cliType.type.js";
import { CLIValidationError, CLIGenerationError } from "../errors/index.js";
import { getRunScriptCommand } from "../installers/dependency.installer.js";
import {
  resolveProjectLayout,
  type ProjectLayout,
} from "../resolvers/layout/projectLayout.core.js";

/** One development server to start. */
export interface DevServerSpec {
  readonly label: string;
  readonly cwd: string;
  readonly file: string;
  readonly args: readonly string[];
  readonly env?: NodeJS.ProcessEnv;
}

/**
 * Computes the servers `zudojs dev` starts for a project layout.
 *
 * Exported so the selection can be tested without spawning anything.
 */
export function planDevServers(
  layout: ProjectLayout,
  options: {
    readonly frontendOnly?: boolean;
    readonly backendOnly?: boolean;
    readonly port?: number;
  } = {},
): DevServerSpec[] {
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

function labelFor(root: string, dir: string, fallback: string): string {
  const rel = relative(root, dir);
  return rel === "" ? fallback : basename(dir);
}

function frontendServer(
  layout: ProjectLayout,
  dir: string,
): DevServerSpec | null {
  const framework = layout.frontendFramework ?? "react";

  if (framework === "none") return null;

  if (framework === "flutter") {
    if (!existsSync(join(dir, "pubspec.yaml"))) return null;
    return {
      label: "web",
      cwd: dir,
      file: "flutter",
      args: ["run", "--debug"],
    };
  }

  if (!existsSync(join(dir, "package.json"))) return null;

  // Angular's package.json has `start: ng serve`; React Native's has `start`.
  const script =
    framework === "angular" || framework === "react-native" ? "start" : "dev";
  const [file, ...args] = getRunScriptCommand(layout.packageManager, script);

  return {
    label: labelFor(layout.root, dir, "frontend"),
    cwd: dir,
    file,
    args,
  };
}

export async function runDevCommand(context: CLIContext): Promise<void> {
  const frontendOnly = context.values["frontend-only"] === true;
  const backendOnly = context.values["backend-only"] === true;
  const port = context.values.port as number | undefined;

  if (frontendOnly && backendOnly) {
    throw new CLIValidationError(
      "Cannot use --frontend-only and --backend-only together.",
    );
  }

  const layout = resolveProjectLayout(context.cwd);

  if (!layout) {
    throw new CLIValidationError(
      "No Zudojs project found in this directory. Run `zudojs create` first.",
    );
  }

  context.logger.info(`Project type: ${layout.projectType}`);
  if (layout.backendDirs.length > 0) {
    context.logger.info(`Backend architecture: ${layout.architecture}`);
  }
  if (layout.frontendFramework) {
    context.logger.info(`Frontend: ${layout.frontendFramework}`);
  }

  const servers = planDevServers(layout, {
    frontendOnly,
    backendOnly,
    ...(port !== undefined ? { port } : {}),
  });

  if (servers.length === 0) {
    context.logger.warn("No development servers to start.");
    return;
  }

  for (const server of servers) {
    context.logger.info(
      `Starting ${server.label}: ${server.file} ${server.args.join(" ")}`,
    );
  }

  // One controller for every server: when any of them exits with an error
  // the others are stopped too, instead of being left running detached
  // after the command has already reported failure.
  const controller = new AbortController();

  const runs = servers.map((server) =>
    runStreaming(server.file, server.args, server.cwd, {
      signal: controller.signal,
      ...(server.env ? { env: server.env } : {}),
    }).catch((error: unknown) => {
      controller.abort();
      throw error;
    }),
  );

  try {
    await Promise.all(runs);
  } catch (error) {
    throw new CLIGenerationError("Development server failed to start.", error);
  }
}
