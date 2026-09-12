/**
 * Fullstack project composer.
 *
 * Orchestrates frontend, backend, and integration generation.
 *
 * @module generators/fullstack
 */

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { ProjectConfiguration } from "../../types/projectConfiguration.type.js";
import type { FrontendGenerationContext } from "../../adapters/frontend/frontendAdapter.type.js";
import { FrontendAdapterRegistry } from "../../registries/adapter/frontendAdapterRegistry.core.js";
import { PackageManagerRegistry } from "../../registries/adapter/packageManagerRegistry.core.js";
import { DependencyResolver } from "../../resolvers/dependency/dependencyResolver.core.js";
import { runFrontendPipeline } from "../frontend/frontendPipeline.js";
import { writeFileTree } from "../../utils/utils.fileSystem.js";
import { renderPnpmWorkspaceFile } from "../../templates/shared/pnpm.template.js";

/**
 * Fullstack generation context.
 */
export interface FullstackGenerationContext {
  readonly project: ProjectConfiguration;
  readonly projectPath: string;
  /** `false` records frontend dependencies instead of installing them. */
  readonly installDeps?: boolean;
}

/**
 * Fullstack generation result.
 */
export interface FullstackGenerationResult {
  readonly success: boolean;
  readonly files: readonly string[];
  readonly errors: readonly string[];
}

/**
 * Composes fullstack projects by orchestrating multiple generators.
 */
export class FullstackComposer {
  private readonly frontendRegistry: FrontendAdapterRegistry;
  private readonly packageManagerRegistry: PackageManagerRegistry;
  private readonly dependencyResolver: DependencyResolver;

  constructor() {
    this.frontendRegistry = new FrontendAdapterRegistry();
    this.packageManagerRegistry = new PackageManagerRegistry();
    this.dependencyResolver = new DependencyResolver();
  }

  /**
   * Generates a fullstack project.
   */
  async generate(
    context: FullstackGenerationContext,
  ): Promise<FullstackGenerationResult> {
    const files: string[] = [];
    const errors: string[] = [];

    try {
      // 1. Create workspace structure
      await this.createWorkspace(context);
      files.push("package.json");
      if (this.getPackageManager(context) === "pnpm") {
        files.push("pnpm-workspace.yaml");
      }

      // 2. Generate shared packages
      await this.generateSharedPackages(context);
      files.push("packages/contracts/", "packages/shared-types/");

      // 3. Generate frontend if configured
      if (context.project.frontend) {
        const frontendFiles = await this.generateFrontend(context);
        files.push(...frontendFiles);
      }

      // Note: integration files and dependency installation are orchestrated
      // by the create command to avoid running them twice.
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }

    return {
      success: errors.length === 0,
      files,
      errors,
    };
  }

  private getPackageManager(context: FullstackGenerationContext): string {
    return context.project.workspace?.packageManager ?? "pnpm";
  }

  private async createWorkspace(
    context: FullstackGenerationContext,
  ): Promise<void> {
    const packageManager = this.getPackageManager(context);
    const workspaceGlobs = ["apps/*", "packages/*"];

    const scriptFor = (script: string): string => {
      switch (packageManager) {
        case "npm":
          return `npm run ${script} --workspaces --if-present`;
        case "yarn":
          return `yarn workspaces run ${script}`;
        case "bun":
          return `bun run --filter '*' ${script}`;
        default:
          return `pnpm -r --parallel run ${script}`;
      }
    };

    const rootPackageJson = {
      name: context.project.name,
      private: true,
      ...(packageManager === "pnpm" ? {} : { workspaces: workspaceGlobs }),
      scripts: {
        dev: scriptFor("dev"),
        build: scriptFor("build"),
        test: scriptFor("test"),
        lint: scriptFor("lint"),
        typecheck: scriptFor("typecheck"),
      },
      devDependencies: {
        typescript: "^5.0.0",
      },
    };

    // The project's type, architecture and frontend are recorded in
    // .zudojs/manifest.json by the create command; no zudojs.config.ts is
    // written. The name reaches package.json through JSON.stringify, so a
    // quote or newline in it stays data.
    const files: Record<string, string> = {
      "package.json": JSON.stringify(rootPackageJson, null, 2) + "\n",
    };

    if (packageManager === "pnpm") {
      files["pnpm-workspace.yaml"] = renderPnpmWorkspaceFile(workspaceGlobs);
    }

    await writeFileTree(context.projectPath, files);
  }

  private async generateSharedPackages(
    context: FullstackGenerationContext,
  ): Promise<void> {
    const contractsIndex = `/**
 * Shared API contracts between frontend and backend.
 */

export interface ApiResponse<T> {
  readonly data: T;
  readonly status: number;
  readonly message?: string;
}

export interface PaginatedResponse<T> {
  readonly data: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
}
`;

    const sharedTypesIndex = `/**
 * Shared types between frontend and backend.
 */

export type ID = string;
export type Timestamp = string;
`;

    await writeFileTree(context.projectPath, {
      "packages/contracts/src/index.ts": contractsIndex,
      "packages/shared-types/src/index.ts": sharedTypesIndex,
    });
  }

  private async generateFrontend(
    context: FullstackGenerationContext,
  ): Promise<readonly string[]> {
    if (!context.project.frontend) return [];

    const adapter = this.frontendRegistry.get(
      context.project.frontend.framework,
    );
    if (!adapter) {
      throw new Error(
        `Unknown frontend framework: ${context.project.frontend.framework}`,
      );
    }

    const frontendPath = join(context.projectPath, "apps", "web");

    // Scaffolders spawn with cwd=frontendPath; the directory must exist
    // before the child process starts or spawn fails with ENOENT.
    await mkdir(frontendPath, { recursive: true });

    const frontendContext: FrontendGenerationContext = {
      project: context.project,
      projectPath: frontendPath,
      framework: adapter.framework,
      language: context.project.frontend.language ?? "typescript",
      architecture: context.project.frontend.architecture,
      packageManager: this.getPackageManager(context) as
        | "pnpm"
        | "npm"
        | "yarn"
        | "bun",
      features: {
        testing: true,
        linting: true,
        formatting: true,
        envValidation: true,
      },
      ...(context.installDeps === false ? { skipInstall: true } : {}),
    };

    // The same pipeline the frontend-only path uses: availability check,
    // scaffold, structure, integration, dependency resolution + install, and
    // adapter validation. Skipping any of it here is what let fullstack
    // projects ship an unvalidated, dependency-less apps/web.
    const outcome = await runFrontendPipeline(
      adapter,
      frontendContext,
      this.packageManagerRegistry,
      this.dependencyResolver,
    );

    if (outcome.errors.length > 0) {
      throw new Error(
        `Frontend generation failed: ${outcome.errors.join("; ")}`,
      );
    }

    return ["apps/web/"];
  }
}
