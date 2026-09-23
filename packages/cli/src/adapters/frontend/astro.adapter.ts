/**
 * Astro frontend adapter.
 *
 * @module adapters/frontend/astro
 */

import { writeFileTree } from "../../utils/utils.fileSystem.js";
import { scaffoldWithFallback } from "../../scaffolders/scaffolder.helper.js";
import { renderAstroFallback, versionFromRange } from "./fallback/index.js";
import { DEPENDENCY_VERSION_RANGES as V } from "../../resolvers/dependency/dependencyVersions.constant.js";
import type {
  FrontendAdapter,
  FrontendGenerationContext,
  DependencyRequirement,
  ValidationResult,
} from "./frontendAdapter.type.js";

/**
 * Astro adapter with island architecture support.
 */
export class AstroAdapter implements FrontendAdapter {
  readonly name = "astro";
  readonly framework = "astro";

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async getLatestVersion(): Promise<string> {
    return versionFromRange(V.astro);
  }

  async scaffold(context: FrontendGenerationContext): Promise<void> {
    const files = renderAstroFallback(context);
    await scaffoldWithFallback({
      command: "npm",
      args: [
        "create",
        "astro@latest",
        ".",
        "--",
        "--template",
        "minimal",
        "--no-install",
        "--no-git",
        "--yes",
      ],
      targetPath: context.projectPath,
      fallbackFiles: files,
    });
  }

  getDependencies(
    context: FrontendGenerationContext,
  ): readonly DependencyRequirement[] {
    const deps: DependencyRequirement[] = [];

    if (context.features.testing) {
      deps.push(
        { name: "vitest", type: "devDependency" },
        { name: "jsdom", type: "devDependency" },
      );
    }

    return deps;
  }

  async applyZudojsStructure(
    context: FrontendGenerationContext,
  ): Promise<void> {
    const structure = this.getStructure(context);
    await writeFileTree(context.projectPath, structure);
  }

  async generateIntegration(context: FrontendGenerationContext): Promise<void> {
    const integrationFiles = this.getIntegrationFiles(context);
    await writeFileTree(context.projectPath, integrationFiles);
  }

  async validate(
    context: FrontendGenerationContext,
  ): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!context.project) {
      errors.push("Project configuration is required");
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  private getStructure(
    context: FrontendGenerationContext,
  ): Record<string, string> {
    return {
      "src/components/.gitkeep": "",
      "src/layouts/.gitkeep": "",
      "src/pages/.gitkeep": "",
      "src/styles/.gitkeep": "",
      "src/types/index.ts": "// Types\nexport {};\n",
      "src/utils/.gitkeep": "",
    };
  }

  private getIntegrationFiles(
    context: FrontendGenerationContext,
  ): Record<string, string> {
    const files: Record<string, string> = {};

    if (context.project.type === "fullstack") {
      files[".env.example"] = `PUBLIC_API_URL=http://localhost:3000\n`;

      files["src/utils/api-client.ts"] = `/**
 * API Client for backend communication.
 */

const API_URL = import.meta.env.PUBLIC_API_URL || "http://localhost:3000";

export interface ApiResponse<T> {
  readonly data: T;
  readonly status: number;
}

export async function apiGet<T>(path: string): Promise<ApiResponse<T>> {
  const response = await fetch(\`\${API_URL}\${path}\`);
  const data = await response.json() as T;
  return { data, status: response.status };
}

export async function apiPost<T>(path: string, body: unknown): Promise<ApiResponse<T>> {
  const response = await fetch(\`\${API_URL}\${path}\`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json() as T;
  return { data, status: response.status };
}
`;
    }

    return files;
  }
}
