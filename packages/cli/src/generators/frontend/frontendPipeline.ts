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
import type { PackageManagerRegistry } from "../../registries/adapter/packageManagerRegistry.core.js";
import type { DependencyResolver } from "../../resolvers/dependency/dependencyResolver.core.js";

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
 */
export async function runFrontendPipeline(
  adapter: FrontendAdapter,
  context: FrontendGenerationContext,
  packageManagerRegistry: PackageManagerRegistry,
  dependencyResolver: DependencyResolver,
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

  // 5. Install BOTH runtime and dev dependencies. Only devDependencies used
  //    to be installed, so every runtime package an adapter declared was
  //    resolved and then dropped on the floor.
  const packageManager = packageManagerRegistry.get(context.packageManager);

  if (packageManager) {
    const deps = resolution.dependencies.map((d) => d.name);
    const devDeps = resolution.devDependencies.map((d) => d.name);
    assertSafePackageNames(deps);
    assertSafePackageNames(devDeps);

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
