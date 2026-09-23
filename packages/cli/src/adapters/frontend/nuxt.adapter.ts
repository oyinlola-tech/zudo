/**
 * Nuxt frontend adapter.
 *
 * @module adapters/frontend/nuxt
 */

import { writeFileTree } from "../../utils/utils.fileSystem.js";
import { scaffoldWithFallback } from "../../scaffolders/scaffolder.helper.js";
import { renderNuxtFallback, versionFromRange } from "./fallback/index.js";
import { DEPENDENCY_VERSION_RANGES as V } from "../../resolvers/dependency/dependencyVersions.constant.js";
import type {
  FrontendAdapter,
  FrontendGenerationContext,
  DependencyRequirement,
  ValidationResult,
} from "./frontendAdapter.type.js";

/**
 * Nuxt adapter targeting Nuxt 4 (application code under app/).
 */
export class NuxtAdapter implements FrontendAdapter {
  readonly name = "nuxt";
  readonly framework = "nuxt";

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async getLatestVersion(): Promise<string> {
    return versionFromRange(V.nuxt);
  }

  async scaffold(context: FrontendGenerationContext): Promise<void> {
    const files = renderNuxtFallback(context);
    await scaffoldWithFallback({
      command: "npx",
      // Without --template, --packageManager and --gitInit nuxi exits with
      // "Missing required arguments" in a non-interactive shell, so every
      // Nuxt project used to get the fallback. --force lets it write into
      // the existing (empty or pnpm-workspace-only) directory without
      // removing what is there.
      args: [
        "nuxi@latest",
        "init",
        ".",
        "--template",
        "minimal",
        "--packageManager",
        context.packageManager,
        "--no-gitInit",
        "--no-install",
        "--force",
      ],
      targetPath: context.projectPath,
      fallbackFiles: files,
    });
  }

  getDependencies(
    context: FrontendGenerationContext,
  ): readonly DependencyRequirement[] {
    const deps: DependencyRequirement[] = [];

    if (context.features.stateManagement === "pinia") {
      deps.push({ name: "pinia", type: "dependency" });
    }

    if (context.features.testing) {
      deps.push(
        { name: "vitest", type: "devDependency" },
        { name: "@vue/test-utils", type: "devDependency" },
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
    // Nuxt 4 resolves application code from app/ (its srcDir); server/
    // and shared/ stay at the project root.
    return {
      "app/components/.gitkeep": "",
      "app/composables/.gitkeep": "",
      "app/layouts/.gitkeep": "",
      "app/pages/.gitkeep": "",
      "app/stores/.gitkeep": "",
      "app/utils/.gitkeep": "",
      "server/.gitkeep": "",
      "shared/types/index.ts": "// Types\nexport {};\n",
    };
  }

  private getIntegrationFiles(
    context: FrontendGenerationContext,
  ): Record<string, string> {
    const files: Record<string, string> = {};

    if (context.project.type === "fullstack") {
      files[".env.example"] = `NUXT_PUBLIC_API_URL=http://localhost:3000\n`;

      files["app/composables/useApi.ts"] = `/**
 * API Client for backend communication.
 */

const API_URL = import.meta.env.NUXT_PUBLIC_API_URL || "http://localhost:3000";

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
