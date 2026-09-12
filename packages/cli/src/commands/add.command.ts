/**
 * zudojs-cli — Add Command
 *
 * The `zudojs add` command for adding feature packages.
 */

import { join, relative } from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { CLIContext } from "../cliType/cliType.type.js";
import { runStreaming } from "../utils/utils.exec.js";
import { assertSafePathSegment } from "../utils/utils.name.js";
import { CLIValidationError, CLIGenerationError } from "../errors/index.js";
import { ManifestManager } from "../manifest/manifestManager.core.js";
import { getInstallCommand } from "../installers/dependency.installer.js";
import {
  FEATURE_PACKAGES,
  ZUDOJS_PACKAGES_VERSION,
} from "../constants/index.js";
import {
  resolveProjectLayout,
  type ProjectLayout,
} from "../resolvers/layout/projectLayout.core.js";

interface PackageJsonShape {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  zudojs?: Record<string, unknown>;
}

/**
 * Picks the `package.json` files a feature is added to.
 *
 * The workspace root used to be the only target. In a fullstack project
 * that root holds no application code, so `@zudojs/database` landed where
 * nothing could import it while `apps/api` stayed without it. Features now
 * go to every backend app (`apps/api`, or the gateway and each service of a
 * microservice project); `--service <name>` narrows a microservice project
 * to one app.
 */
export function selectAddTargets(
  layout: ProjectLayout,
  service: string | undefined,
): string[] {
  if (service !== undefined) {
    if (layout.architecture !== "microservice") {
      throw new CLIValidationError(
        "--service only applies to microservice projects.",
      );
    }

    const match = layout.backendDirs.find((dir) =>
      dir.endsWith(`${join("apps", "services", service)}`),
    );
    const gateway = layout.backendDirs.find((dir) =>
      dir.endsWith(join("apps", "gateway")),
    );

    const target = service === "gateway" ? gateway : match;

    if (!target) {
      throw new CLIValidationError(
        `Unknown service "${service}". Known: ${[
          ...(gateway ? ["gateway"] : []),
          ...layout.services,
        ].join(", ")}`,
      );
    }

    return [join(target, "package.json")];
  }

  return layout.backendDirs.map((dir) => join(dir, "package.json"));
}

/**
 * The version written for a new `@zudojs/*` dependency.
 *
 * `workspace:*` was written whenever the project was a workspace. Every
 * generated fullstack and microservice project is a workspace, and none of
 * them contains the framework packages, so the next install failed with
 * "not found in workspace". The protocol is now used only when the target
 * already links a framework package that way — i.e. inside the Zudojs
 * monorepo itself.
 */
export function versionForNewDependency(pkg: PackageJsonShape): string {
  const linksFramework = Object.entries({
    ...pkg.dependencies,
    ...pkg.devDependencies,
  }).some(
    ([name, version]) =>
      name.startsWith("@zudojs/") && version.startsWith("workspace:"),
  );

  return linksFramework ? "workspace:*" : ZUDOJS_PACKAGES_VERSION;
}

export async function runAddCommand(context: CLIContext): Promise<void> {
  const feature = context.values.feature as string | undefined;
  const service = context.values.service as string | undefined;
  const available = Object.keys(FEATURE_PACKAGES).join(", ");

  if (!feature) {
    throw new CLIValidationError(
      `Feature name is required. Available: ${available}`,
    );
  }

  const packages = FEATURE_PACKAGES[feature];

  if (!packages) {
    throw new CLIValidationError(
      `Unknown feature: "${feature}". Available: ${available}`,
    );
  }

  if (service !== undefined) {
    assertSafePathSegment(service, "--service");
  }

  const layout = resolveProjectLayout(context.cwd);

  if (!layout) {
    throw new CLIValidationError(
      "No Zudojs project found in this directory. Run `zudojs create` first.",
    );
  }

  if (layout.projectType === "frontend") {
    throw new CLIValidationError(
      "Features are backend packages; this is a frontend-only project.",
    );
  }

  const targets = selectAddTargets(layout, service);

  if (targets.length === 0) {
    throw new CLIValidationError(
      "No backend app with a package.json was found in this project.",
    );
  }

  context.logger.info(`Adding feature: ${feature}`);
  context.logger.info(`Packages: ${packages.join(", ")}`);

  try {
    for (const pkgPath of targets) {
      if (!existsSync(pkgPath)) {
        throw new CLIGenerationError(`Could not find ${pkgPath}`);
      }

      const pkg = JSON.parse(
        readFileSync(pkgPath, "utf-8"),
      ) as PackageJsonShape;
      const version = versionForNewDependency(pkg);

      pkg.dependencies ??= {};
      pkg.zudojs ??= { features: [] };

      const block = pkg.zudojs as { features?: unknown };
      const features = new Set(
        Array.isArray(block.features)
          ? block.features.filter((f): f is string => typeof f === "string")
          : [],
      );
      features.add(feature);
      block.features = [...features];

      for (const name of packages) {
        if (!(name in pkg.dependencies)) {
          pkg.dependencies[name] = version;
        }
      }

      writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
      context.logger.info(
        `Updated ${relative(context.cwd, pkgPath) || "package.json"}`,
      );
    }

    // The manifest records capabilities for the whole project.
    await new ManifestManager(layout.root).addCapability(feature);

    if (context.values["skip-install"] !== true) {
      const [file, ...args] = getInstallCommand(layout.packageManager);
      context.logger.info(`Installing dependencies with ${file}...`);
      await runStreaming(file, args, layout.root);
    }

    context.logger.info(`Feature "${feature}" added successfully.`);
    context.logger.info(
      `Import from ${packages.map((p) => `"${p}"`).join(", ")} in your modules.`,
    );
  } catch (error) {
    if (error instanceof CLIValidationError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new CLIGenerationError(
      `Failed to add feature "${feature}": ${message}`,
      error,
    );
  }
}
