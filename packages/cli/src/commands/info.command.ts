/**
 * zudojs-cli — Info Command
 *
 * The `zudojs info` command.
 */

import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { CLIContext } from "../cliType/cliType.type.js";
import { CLI_VERSION } from "../constants/index.js";
import { checkForNewerVersion } from "../cliVersion/cliVersion.update.js";
import { resolveProjectLayout } from "../resolvers/layout/projectLayout.core.js";

export async function runInfoCommand(context: CLIContext): Promise<void> {
  context.logger.info("Zudojs CLI");
  context.logger.info(`  Version: ${CLI_VERSION}`);
  context.logger.info(`  Node.js: ${process.version}`);

  const update = await checkForNewerVersion(CLI_VERSION, { env: context.env });
  if (update.latest) {
    context.logger.info(
      `  Update available: ${update.latest} (npm install -g zudojs-cli@latest)`,
    );
  }

  context.logger.info("");

  const layout = resolveProjectLayout(context.cwd);

  if (!layout) {
    context.logger.info("Not in a Zudojs project directory.");
    context.logger.info(
      "Run `zudojs create <project-name>` to create a new project.",
    );
    return;
  }

  let projectName = "unknown";
  let projectVersion = "0.0.0";

  try {
    const pkg = JSON.parse(
      readFileSync(join(layout.root, "package.json"), "utf-8"),
    ) as { name?: string; version?: string };
    projectName = pkg.name ?? projectName;
    projectVersion = pkg.version ?? projectVersion;
  } catch {
    // A project without a root package.json still has a manifest.
  }

  context.logger.info("Project");
  context.logger.info(`  Name: ${projectName}`);
  context.logger.info(`  Version: ${projectVersion}`);
  context.logger.info(`  Type: ${layout.projectType}`);
  if (layout.backendDirs.length > 0) {
    context.logger.info(`  Architecture: ${layout.architecture}`);
  }
  if (layout.frontendFramework) {
    context.logger.info(`  Frontend: ${layout.frontendFramework}`);
  }
  context.logger.info(`  Package manager: ${layout.packageManager}`);
  if (layout.services.length > 0) {
    context.logger.info(`  Services: ${layout.services.join(", ")}`);
  }

  context.logger.info("");
  context.logger.info("Zudojs dependencies");

  const deps = new Map<string, string>();

  for (const dir of layout.backendDirs) {
    try {
      const pkg = JSON.parse(
        readFileSync(join(dir, "package.json"), "utf-8"),
      ) as { dependencies?: Record<string, string> };
      for (const [name, version] of Object.entries(pkg.dependencies ?? {})) {
        if (name.startsWith("@zudojs/")) {
          const where = relative(layout.root, dir);
          deps.set(where === "" ? name : `${name} (${where})`, version);
        }
      }
    } catch {
      // Reported by `zudojs doctor`.
    }
  }

  if (deps.size === 0) {
    context.logger.info("  (none)");
    return;
  }

  for (const [name, version] of [...deps.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    context.logger.info(`  ${name}: ${version}`);
  }
}
