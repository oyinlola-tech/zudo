/**
 * zudojs-cli — Dev Command
 *
 * The `zudojs dev` command. Starts the development servers of the project
 * in the current directory (see `dev/dev.plan.ts` for how they are chosen).
 * A selection that leaves nothing to start (`--frontend-only` in a backend
 * project, for instance) is an error, not a warning followed by exit 0.
 */

import { runStreaming } from "../utils/utils.exec.js";
import type { CLIContext } from "../cliType/cliType.type.js";
import { CLIValidationError, CLIGenerationError } from "../errors/index.js";
import { resolveProjectLayout } from "../resolvers/layout/projectLayout.core.js";
import { describeNothingToStart, planDevServers } from "./dev/index.js";

export { planDevServers, type DevServerSpec } from "./dev/index.js";

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

  const selection = {
    frontendOnly,
    backendOnly,
    ...(port !== undefined ? { port } : {}),
  };
  const servers = planDevServers(layout, selection);

  if (servers.length === 0) {
    throw new CLIValidationError(describeNothingToStart(layout, selection));
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
