/**
 * Frontend generator using the adapter system.
 *
 * @module generators/frontend
 */

import type { ProjectConfiguration } from "../../types/projectConfiguration.type.js";
import type { FrontendGenerationContext } from "../../adapters/frontend/frontendAdapter.type.js";
import { FrontendAdapterRegistry } from "../../registries/adapter/frontendAdapterRegistry.core.js";
import { PackageManagerRegistry } from "../../registries/adapter/packageManagerRegistry.core.js";
import { DependencyResolver } from "../../resolvers/dependency/dependencyResolver.core.js";
import { CLIGenerationError } from "../../errors/index.js";
import { runFrontendPipeline } from "./frontendPipeline.js";
import { writeFileTree } from "../../utils/utils.fileSystem.js";
import { renderPnpmWorkspaceFile } from "../../templates/shared/pnpm.template.js";

/**
 * Frontend generation options.
 */
export interface FrontendGenerationOptions {
  readonly project: ProjectConfiguration;
  readonly projectPath: string;
  readonly framework: string;
  readonly architecture?:
    "zudojs-standard" | "feature-based" | "minimal" | "framework-default";
  readonly language?: "typescript" | "javascript";
  readonly packageManager?: "pnpm" | "npm" | "yarn" | "bun";
  /** `false` records dependencies in package.json instead of installing. */
  readonly installDeps?: boolean;
}

/**
 * Frontend generation result.
 */
export interface FrontendGenerationResult {
  readonly success: boolean;
  readonly framework: string;
  readonly files: readonly string[];
  readonly errors: readonly string[];
}

/**
 * Generates frontend projects using framework adapters.
 */
export class FrontendGenerator {
  private readonly adapterRegistry: FrontendAdapterRegistry;
  private readonly packageManagerRegistry: PackageManagerRegistry;
  private readonly dependencyResolver: DependencyResolver;

  constructor() {
    this.adapterRegistry = new FrontendAdapterRegistry();
    this.packageManagerRegistry = new PackageManagerRegistry();
    this.dependencyResolver = new DependencyResolver();
  }

  /**
   * Generates a frontend project.
   */
  async generate(
    options: FrontendGenerationOptions,
  ): Promise<FrontendGenerationResult> {
    const adapter = this.adapterRegistry.get(options.framework);

    if (!adapter) {
      throw new CLIGenerationError(
        `Unknown frontend framework: ${options.framework}. Available: ${this.adapterRegistry.getNames().join(", ")}`,
      );
    }

    const context: FrontendGenerationContext = {
      project: options.project,
      projectPath: options.projectPath,
      framework: adapter.framework,
      language: options.language ?? "typescript",
      architecture: options.architecture ?? "zudojs-standard",
      packageManager: options.packageManager ?? "pnpm",
      features: {
        testing: true,
        linting: true,
        formatting: true,
      },
      ...(options.installDeps === false ? { skipInstall: true } : {}),
    };

    const files: string[] = [];
    const errors: string[] = [];

    try {
      // A frontend-only project is its own pnpm root. Vite depends on
      // esbuild, whose install script pnpm 10+ refuses without this list,
      // and the pipeline installs dependencies right after scaffolding.
      if (context.packageManager === "pnpm") {
        await writeFileTree(context.projectPath, {
          "pnpm-workspace.yaml": renderPnpmWorkspaceFile(),
        });
      }

      const outcome = await runFrontendPipeline(
        adapter,
        context,
        this.packageManagerRegistry,
        this.dependencyResolver,
      );
      files.push(...outcome.files);
      errors.push(...outcome.errors);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }

    return {
      success: errors.length === 0,
      framework: options.framework,
      files,
      errors,
    };
  }

  /**
   * Gets available frontend frameworks.
   */
  getAvailableFrameworks(): readonly string[] {
    return this.adapterRegistry.getNames();
  }
}
