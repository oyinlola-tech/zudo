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
import { writeFileTree } from "../../utils/utils.fileSystem.js";

/**
 * Fullstack generation context.
 */
export interface FullstackGenerationContext {
  readonly project: ProjectConfiguration;
  readonly projectPath: string;
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

  constructor() {
    this.frontendRegistry = new FrontendAdapterRegistry();
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
      files.push("package.json", "zudojs.config.ts");
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

    const frontendBlock = context.project.frontend
      ? `
  frontend: {
    framework: "${context.project.frontend.framework}",
  },`
      : "";

    const zudojsConfig = `export default {
  name: "${context.project.name}",
  projectType: "fullstack",
  architecture: "${context.project.backend?.architecture ?? "monolith"}",${frontendBlock}
};
`;

    const files: Record<string, string> = {
      "package.json": JSON.stringify(rootPackageJson, null, 2) + "\n",
      "zudojs.config.ts": zudojsConfig,
    };

    if (packageManager === "pnpm") {
      files["pnpm-workspace.yaml"] = `packages:
${workspaceGlobs.map((g) => `  - "${g}"`).join("\n")}
`;
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
    };

    await adapter.scaffold(frontendContext);
    await adapter.applyZudojsStructure(frontendContext);
    await adapter.generateIntegration(frontendContext);

    return ["apps/web/"];
  }
}
