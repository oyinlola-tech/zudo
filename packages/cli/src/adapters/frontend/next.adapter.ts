/**
 * Next.js frontend adapter with App Router support.
 *
 * @module adapters/frontend/next
 */

import { execCommand } from "../../utils/utils.exec.js";
import { writeFileTree } from "../../utils/utils.fileSystem.js";
import { scaffoldWithFallback } from "../../scaffolders/scaffolder.helper.js";
import { renderNextFallback, versionFromRange } from "./fallback/index.js";
import { DEPENDENCY_VERSION_RANGES as V } from "../../resolvers/dependency/dependencyVersions.constant.js";
import type {
  FrontendAdapter,
  FrontendGenerationContext,
  DependencyRequirement,
  ValidationResult,
} from "./frontendAdapter.type.js";

/**
 * Next.js adapter with App Router support.
 */
export class NextAdapter implements FrontendAdapter {
  readonly name = "next";
  readonly framework = "next";

  async isAvailable(): Promise<boolean> {
    try {
      await execCommand("node", ["--version"], ".");
      return true;
    } catch {
      return false;
    }
  }

  async getLatestVersion(): Promise<string> {
    return versionFromRange(V.next);
  }

  async scaffold(context: FrontendGenerationContext): Promise<void> {
    const files = renderNextFallback(context);
    await scaffoldWithFallback({
      command: "npx",
      args: [
        "create-next-app@latest",
        ".",
        "--typescript",
        "--no-eslint",
        "--no-tailwind",
        // The Zudojs structure and the fallback both live under src/.
        "--src-dir",
        "--app",
        "--import-alias",
        "@/*",
        // The pipeline installs with the project's package manager, and a
        // fullstack project's apps/web must not become a nested git repo.
        `--use-${context.packageManager}`,
        "--skip-install",
        "--disable-git",
      ],
      targetPath: context.projectPath,
      fallbackFiles: files,
    });
  }

  getDependencies(
    context: FrontendGenerationContext,
  ): readonly DependencyRequirement[] {
    const deps: DependencyRequirement[] = [];

    if (context.features.stateManagement === "zustand") {
      deps.push({ name: "zustand", type: "dependency" });
    }

    if (context.features.testing) {
      deps.push(
        { name: "vitest", type: "devDependency" },
        { name: "@testing-library/react", type: "devDependency" },
        // Peer dependency of @testing-library/react since v16.
        { name: "@testing-library/dom", type: "devDependency" },
        { name: "@testing-library/jest-dom", type: "devDependency" },
        { name: "@testing-library/user-event", type: "devDependency" },
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
    const srcDir = "src";

    return {
      [`${srcDir}/app/.gitkeep`]: "",
      [`${srcDir}/components/.gitkeep`]: "",
      [`${srcDir}/lib/.gitkeep`]: "",
      [`${srcDir}/types/index.ts`]: "// Types\nexport {};\n",
    };
  }

  private getIntegrationFiles(
    context: FrontendGenerationContext,
  ): Record<string, string> {
    const files: Record<string, string> = {};

    if (context.project.type === "fullstack") {
      files[".env.local.example"] =
        `NEXT_PUBLIC_API_URL=http://localhost:3000\n`;

      files["src/lib/api-client.ts"] = `/**
 * API Client for backend communication.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

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
