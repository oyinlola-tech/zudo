/**
 * zudojs-cli — Add Command
 *
 * The `zudojs add` command for adding feature packages.
 */

import { join } from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { CLIContext } from "../cliType/cliType.type.js";
import { runStreaming } from "../utils/utils.exec.js";
import { CLIValidationError, CLIGenerationError } from "../errors/index.js";
import { ManifestManager } from "../manifest/manifestManager.core.js";
import { ZUDOJS_PACKAGES_VERSION } from "../constants/index.js";

const FEATURE_PACKAGES: Readonly<Record<string, readonly string[]>> = {
  database: ["@zudojs/database"],
  queue: ["@zudojs/queue"],
  messaging: ["@zudojs/messaging"],
  openapi: ["@zudojs/openapi"],
  observability: ["@zudojs/observability"],
  security: ["@zudojs/security"],
  cache: ["@zudojs/cache"],
  storage: ["@zudojs/storage"],
  scheduler: ["@zudojs/queue"],
  docs: ["@zudojs/docs"],
};

export async function runAddCommand(context: CLIContext): Promise<void> {
  const feature = context.values.feature as string | undefined;

  if (!feature) {
    throw new CLIValidationError(
      "Feature name is required. Available: database, queue, messaging, openapi, observability, security",
    );
  }

  const packages = FEATURE_PACKAGES[feature];

  if (!packages) {
    throw new CLIValidationError(
      `Unknown feature: "${feature}". Available: ${Object.keys(FEATURE_PACKAGES).join(", ")}`,
    );
  }

  context.logger.info(`Adding feature: ${feature}`);
  context.logger.info(`Packages: ${packages.join(", ")}`);

  try {
    const { manager, rootPkg, isWorkspace } = detectPackageManager(context.cwd);
    const pkgPath = join(context.cwd, rootPkg);
    const version = isWorkspace ? "workspace:*" : ZUDOJS_PACKAGES_VERSION;

    if (!existsSync(pkgPath)) {
      throw new CLIGenerationError(`Could not find package.json at ${pkgPath}`);
    }

    const pkgContent = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      zudojs?: Record<string, unknown>;
    };

    pkgContent.dependencies ??= {};
    pkgContent.zudojs ??= {
      features: [],
    };

    const zudojsConfig = pkgContent.zudojs as {
      features: string[];
    };

    const features = new Set(zudojsConfig.features);
    if (!features.has(feature)) {
      features.add(feature);
      zudojsConfig.features = [...features];
    }

    for (const pkg of packages) {
      if (!(pkg in pkgContent.dependencies)) {
        pkgContent.dependencies[pkg] = version;
      }
    }

    writeFileSync(pkgPath, JSON.stringify(pkgContent, null, 2) + "\n");

    context.logger.info(`Updated ${rootPkg} with new dependencies.`);

    updateZudojsConfig(context.cwd, feature);

    const manifest = new ManifestManager(context.cwd);
    const current = await manifest.read();
    if (current) {
      await manifest.addCapability(feature);
    }

    if (context.values["skip-install"] !== true) {
      context.logger.info(`Installing dependencies with ${manager}...`);
      await runStreaming(manager, ["install"], context.cwd);
    }

    context.logger.info(`Feature "${feature}" added successfully.`);
    context.logger.info(`Next steps:`);
    context.logger.info(`  Configure in src/config/${feature}.config.ts`);
  } catch (error) {
    if (error instanceof CLIValidationError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    context.logger.error(`Failed to add feature: ${feature} - ${message}`);
    throw new CLIGenerationError(
      `Failed to add feature: ${feature}: ${message}`,
      error,
    );
  }
}

function detectPackageManager(cwd: string): {
  manager: string;
  rootPkg: string;
  isWorkspace: boolean;
} {
  // A project is a workspace only when a workspace definition exists:
  // pnpm-workspace.yaml or a "workspaces" field in package.json. Lock files
  // merely indicate the package manager.
  const hasPnpmWorkspace = existsSync(join(cwd, "pnpm-workspace.yaml"));
  let hasWorkspacesField = false;

  try {
    const pkgPath = join(cwd, "package.json");
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
        workspaces?: unknown;
      };
      hasWorkspacesField = pkg.workspaces !== undefined;
    }
  } catch {
    // ignore malformed package.json
  }

  const isWorkspace = hasPnpmWorkspace || hasWorkspacesField;

  const manager =
    hasPnpmWorkspace || existsSync(join(cwd, "pnpm-lock.yaml"))
      ? "pnpm"
      : existsSync(join(cwd, "yarn.lock"))
        ? "yarn"
        : existsSync(join(cwd, "bun.lock")) ||
            existsSync(join(cwd, "bun.lockb"))
          ? "bun"
          : "npm";

  return { manager, rootPkg: "package.json", isWorkspace };
}

function updateZudojsConfig(cwd: string, feature: string): void {
  const configPath = join(cwd, "zudojs.config.ts");
  if (!existsSync(configPath)) return;

  let content = readFileSync(configPath, "utf-8");

  const featureMap: Record<string, string> = {
    database: "database",
    queue: "queue",
    messaging: "events",
    openapi: "openapi",
    observability: "observability",
    security: "security",
    cache: "cache",
    storage: "storage",
    scheduler: "scheduler",
    docs: "docs",
  };

  const configKey = featureMap[feature];
  if (!configKey) return;

  const pattern = /(export\s+default\s+defineConfig\(\{[\s\S]*?)\n\}\);/;
  const match = content.match(pattern);
  if (!match) return;

  const featureBlock = `\n  ${configKey}: {\n    enabled: true,\n  },`;

  if (content.includes(`${configKey}:`)) {
    content = content.replace(
      new RegExp(`${configKey}:\\s*\\{[^}]*\\}`),
      `${configKey}: {\n    enabled: true,\n  }`,
    );
  } else {
    content = content.replace(pattern, `$1${featureBlock}\n});`);
  }
  writeFileSync(configPath, content);
}
