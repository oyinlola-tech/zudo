/**
 * Svelte frontend adapter using Vite.
 *
 * @module adapters/frontend/svelte
 */

import { writeFileTree } from "../../utils/utils.fileSystem.js";
import { scaffoldWithFallback } from "../../scaffolders/scaffolder.helper.js";
import { renderSvelteFallback, versionFromRange } from "./fallback/index.js";
import { DEPENDENCY_VERSION_RANGES as V } from "../../resolvers/dependency/dependencyVersions.constant.js";
import type {
  FrontendAdapter,
  FrontendGenerationContext,
  DependencyRequirement,
  ValidationResult,
} from "./frontendAdapter.type.js";

/**
 * Svelte adapter using Vite as the build tool.
 */
export class SvelteAdapter implements FrontendAdapter {
  readonly name = "svelte";
  readonly framework = "svelte";

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async getLatestVersion(): Promise<string> {
    return versionFromRange(V.svelte);
  }

  async scaffold(context: FrontendGenerationContext): Promise<void> {
    const files = renderSvelteFallback(context);
    await scaffoldWithFallback({
      command: "npm",
      args: [
        "create",
        "vite@latest",
        ".",
        "--",
        "--template",
        context.language === "javascript" ? "svelte" : "svelte-ts",
      ],
      targetPath: context.projectPath,
      fallbackFiles: files,
    });
  }

  getDependencies(
    context: FrontendGenerationContext,
  ): readonly DependencyRequirement[] {
    const deps: DependencyRequirement[] = [
      { name: "svelte", type: "dependency" },
    ];

    if (context.features.testing) {
      deps.push(
        { name: "vitest", type: "devDependency" },
        { name: "@testing-library/svelte", type: "devDependency" },
        { name: "jsdom", type: "devDependency" },
      );
    }

    if (context.features.linting) {
      deps.push(
        { name: "eslint", type: "devDependency" },
        { name: "eslint-plugin-svelte", type: "devDependency" },
      );
    }

    if (context.features.formatting) {
      deps.push({ name: "prettier", type: "devDependency" });
      deps.push({ name: "prettier-plugin-svelte", type: "devDependency" });
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
    const srcDir = "src";

    if (context.architecture === "feature-based") {
      return this.getFeatureBasedStructure(srcDir);
    }

    if (context.architecture === "minimal") {
      return this.getMinimalStructure(srcDir);
    }

    return this.getZudojsStandardStructure(srcDir);
  }

  private getZudojsStandardStructure(srcDir: string): Record<string, string> {
    return {
      [`${srcDir}/components/.gitkeep`]: "",
      [`${srcDir}/configs/index.ts`]: "// Configuration\nexport {};\n",
      [`${srcDir}/constants/index.ts`]: "// Constants\nexport {};\n",
      [`${srcDir}/hooks/.gitkeep`]: "",
      [`${srcDir}/layouts/.gitkeep`]: "",
      [`${srcDir}/pages/.gitkeep`]: "",
      [`${srcDir}/routes/.gitkeep`]: "",
      [`${srcDir}/services/.gitkeep`]: "",
      [`${srcDir}/stores/.gitkeep`]: "",
      [`${srcDir}/types/index.ts`]: "// Types\nexport {};\n",
      [`${srcDir}/utils/.gitkeep`]: "",
    };
  }

  private getFeatureBasedStructure(srcDir: string): Record<string, string> {
    return {
      [`${srcDir}/features/.gitkeep`]: "",
      [`${srcDir}/components/.gitkeep`]: "",
      [`${srcDir}/hooks/.gitkeep`]: "",
      [`${srcDir}/services/.gitkeep`]: "",
      [`${srcDir}/types/index.ts`]: "// Types\nexport {};\n",
      [`${srcDir}/utils/.gitkeep`]: "",
    };
  }

  private getMinimalStructure(srcDir: string): Record<string, string> {
    return {
      [`${srcDir}/components/.gitkeep`]: "",
      [`${srcDir}/utils/.gitkeep`]: "",
    };
  }

  private getIntegrationFiles(
    context: FrontendGenerationContext,
  ): Record<string, string> {
    const files: Record<string, string> = {};

    if (context.project.type === "fullstack") {
      files[".env.example"] = `VITE_API_URL=http://localhost:3000\n`;

      files["src/services/api-client.ts"] = `/**
 * API Client for backend communication.
 */

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

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
