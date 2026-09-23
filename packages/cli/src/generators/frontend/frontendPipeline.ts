/**
 * Shared frontend generation pipeline.
 *
 * Both `FrontendGenerator` (frontend-only projects) and `FullstackComposer`
 * (the `apps/web` half of a fullstack project) drive frontend adapters. They
 * used to do it with two different sequences: the fullstack path skipped
 * availability checks, dependency resolution, dependency installation and
 * adapter validation entirely. This module is the single sequence both use so
 * the two paths cannot drift again.
 *
 * @module generators/frontend/pipeline
 */

import type {
  FrontendAdapter,
  FrontendGenerationContext,
} from "../../adapters/frontend/frontendAdapter.type.js";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { PackageManagerRegistry } from "../../registries/adapter/packageManagerRegistry.core.js";
import type {
  DependencyResolver,
  ResolvedDependency,
} from "../../resolvers/dependency/dependencyResolver.core.js";
import { writeFileTree } from "../../utils/utils.fileSystem.js";
import { CLIGenerationError } from "../../errors/index.js";

/** Outcome of running the frontend pipeline for a single adapter. */
export interface FrontendPipelineResult {
  readonly files: readonly string[];
  readonly errors: readonly string[];
}

/**
 * Rejects package names a package manager would read as a flag.
 *
 * Adapter dependency lists are static today, but they are part of the public
 * `FrontendAdapter` contract and a third-party adapter could return
 * `--registry=...`. Package names go into an argv array (never a shell), so
 * this closes argument injection rather than command injection.
 */
function assertSafePackageNames(names: readonly string[]): void {
  for (const name of names) {
    if (name.startsWith("-") || name.trim() === "" || /\s/.test(name)) {
      throw new Error(`Refusing to install unsafe package name: "${name}"`);
    }
  }
}

/**
 * Runs the full adapter sequence: availability check, scaffold, structure,
 * integration, dependency resolution, dependency installation, validation.
 *
 * @param postScaffoldFiles - Files written right after the scaffold step
 *   (e.g. a standalone project's `pnpm-workspace.yaml`). They must not exist
 *   earlier: `create-vite` cancels in a non-empty directory yet exits 0, so
 *   a pre-written file left the project with no Vite app at all.
 */
export async function runFrontendPipeline(
  adapter: FrontendAdapter,
  context: FrontendGenerationContext,
  packageManagerRegistry: PackageManagerRegistry,
  dependencyResolver: DependencyResolver,
  postScaffoldFiles: Readonly<Record<string, string>> = {},
): Promise<FrontendPipelineResult> {
  const files: string[] = [];
  const errors: string[] = [];

  // 0. Fail fast with a readable message when the framework's own toolchain
  //    is missing. Adapters such as Flutter shell out with no fallback, so
  //    without this the user sees a bare ENOENT after the project directory
  //    has already been created and rolled back.
  const available = await adapter.isAvailable();
  if (!available) {
    return {
      files,
      errors: [
        `The toolchain required by the "${adapter.name}" frontend is not available on this machine. Install it and re-run, or choose another frontend.`,
      ],
    };
  }

  // 1. Scaffold using the official tool (adapters fall back to built-in
  //    templates where one exists).
  await adapter.scaffold(context);
  files.push("scaffold");
  if (Object.keys(postScaffoldFiles).length > 0) {
    await writeFileTree(context.projectPath, { ...postScaffoldFiles });
  }

  // 2. Apply the Zudojs structure over the scaffolded project.
  await adapter.applyZudojsStructure(context);
  files.push("structure");

  // 3. Generate the adapter's integration files (API client, env helpers).
  await adapter.generateIntegration(context);
  files.push("integration");

  // 4. Resolve dependencies and stop on conflicts.
  const resolution = dependencyResolver.resolve(adapter.getDependencies(context));

  if (resolution.conflicts.length > 0) {
    for (const conflict of resolution.conflicts) {
      errors.push(`Conflict: ${conflict.reason}`);
    }
    return { files, errors };
  }

  // The resolver records a warning for every dependency it could not pin,
  // which then goes into package.json as "latest". Nothing read that array,
  // so an adapter adding a dependency with no registered range silently made
  // the generated project unreproducible.
  for (const warning of resolution.warnings) {
    process.stderr.write(`warning: ${warning}\n`);
  }

  // 5. Install BOTH runtime and dev dependencies. Only devDependencies used
  //    to be installed, so every runtime package an adapter declared was
  //    resolved and then dropped on the floor. With `--no-install` the
  //    dependencies are written to package.json for a later install.
  const packageManager = packageManagerRegistry.get(context.packageManager);

  if (context.skipInstall === true) {
    await recordDependencies(context.projectPath, resolution.dependencies, resolution.devDependencies);
    files.push("dependencies");
  } else if (packageManager) {
    // Install the resolved RANGE, not just the name. Mapping to names alone
    // let npm/pnpm resolve `latest`, so the pinning the resolver exists to
    // provide survived only on the `--no-install` path and two runs a month
    // apart produced different majors. The names are validated separately
    // from the `name@range` specs actually passed to the package manager.
    assertSafePackageNames(resolution.dependencies.map((d) => d.name));
    assertSafePackageNames(resolution.devDependencies.map((d) => d.name));

    const deps = resolution.dependencies.map((d) => `${d.name}@${d.version}`);
    const devDeps = resolution.devDependencies.map(
      (d) => `${d.name}@${d.version}`,
    );

    if (deps.length > 0) {
      await packageManager.add(context.projectPath, deps);
    }
    if (devDeps.length > 0) {
      await packageManager.addDev(context.projectPath, devDeps);
    }
    files.push("dependencies");
  } else {
    errors.push(`Unknown package manager: ${context.packageManager}`);
  }

  // 6. Validate the generated project and surface the adapter's own findings.
  const validation = await adapter.validate(context);
  if (!validation.valid) {
    errors.push(...validation.errors);
  }

  return { files, errors };
}

/**
 * Adds the resolved dependencies to the project's package.json without
 * running a package manager. Existing entries win: the adapter's own
 * template may already pin a version.
 */
async function recordDependencies(
  projectPath: string,
  dependencies: readonly ResolvedDependency[],
  devDependencies: readonly ResolvedDependency[],
): Promise<void> {
  const pkgPath = join(projectPath, "package.json");
  let pkg: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    [key: string]: unknown;
  } = {};

  if (existsSync(pkgPath)) {
    // Fail the scaffold rather than replace an unparsable package.json with
    // one holding only dependencies: that silently dropped name, scripts and
    // type (tooling/CLI-07).
    try {
      pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as typeof pkg;
    } catch (error) {
      throw new CLIGenerationError(
        `Could not parse ${pkgPath}; refusing to overwrite it with only the resolved dependencies.`,
        error,
      );
    }
  }

  const merge = (
    target: Record<string, string> | undefined,
    entries: readonly ResolvedDependency[],
  ): Record<string, string> => {
    const merged = { ...(target ?? {}) };
    for (const entry of entries) {
      if (!(entry.name in merged)) {
        merged[entry.name] = entry.version;
      }
    }
    return merged;
  };

  if (dependencies.length > 0) {
    pkg.dependencies = merge(pkg.dependencies, dependencies);
  }
  if (devDependencies.length > 0) {
    pkg.devDependencies = merge(pkg.devDependencies, devDependencies);
  }

  await writeFileTree(projectPath, {
    "package.json": JSON.stringify(pkg, null, 2) + "\n",
  });
}
