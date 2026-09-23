/**
 * Angular frontend adapter.
 *
 * @module adapters/frontend/angular
 */

import { writeFileTree } from "../../utils/utils.fileSystem.js";
import { normalizeName } from "../../utils/utils.name.js";
import { scaffoldWithFallback } from "../../scaffolders/scaffolder.helper.js";
import { renderAngularFallback, versionFromRange } from "./fallback/index.js";
import {
  ANGULAR_VITEST_VERSION_RANGE,
  DEPENDENCY_VERSION_RANGES as V,
} from "../../resolvers/dependency/dependencyVersions.constant.js";
import type {
  FrontendAdapter,
  FrontendGenerationContext,
  DependencyRequirement,
  ValidationResult,
} from "./frontendAdapter.type.js";

/**
 * Angular adapter with standalone support.
 */
export class AngularAdapter implements FrontendAdapter {
  readonly name = "angular";
  readonly framework = "angular";

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async getLatestVersion(): Promise<string> {
    return versionFromRange(V["@angular/core"]);
  }

  async scaffold(context: FrontendGenerationContext): Promise<void> {
    // Angular CLI requires a valid project name; "." is not one. Pass the
    // real name and scaffold into the current directory via --directory.
    const projectName = normalizeName(context.project.name) || "zudojs-app";
    await scaffoldWithFallback({
      command: "npx",
      args: [
        "@angular/cli@latest",
        "new",
        projectName,
        "--directory",
        ".",
        "--skip-git",
        "--skip-install",
        "--routing",
        "--style",
        "css",
        "--package-manager",
        context.packageManager,
      ],
      targetPath: context.projectPath,
      fallbackFiles: renderAngularFallback(context, projectName),
    });
  }

  getDependencies(
    context: FrontendGenerationContext,
  ): readonly DependencyRequirement[] {
    const deps: DependencyRequirement[] = [];

    if (context.features.stateManagement === "ngrx") {
      deps.push({ name: "@ngrx/store", type: "dependency" });
    }

    if (context.features.testing) {
      // Angular 22 runs unit tests through @angular/build:unit-test with
      // Vitest, whose peer range is ^4 (not the ^5 other frameworks use).
      // Jest via @angular-builders/jest fought the scaffolded builder.
      deps.push(
        {
          name: "vitest",
          version: ANGULAR_VITEST_VERSION_RANGE,
          type: "devDependency",
        },
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
      "src/app/components/.gitkeep": "",
      "src/app/pages/.gitkeep": "",
      "src/app/services/.gitkeep": "",
      "src/app/utils/.gitkeep": "",
      "src/app/types/index.ts": "// Types\nexport {};\n",
      "src/assets/.gitkeep": "",
      "src/environments/.gitkeep": "",
    };
  }

  private getIntegrationFiles(
    context: FrontendGenerationContext,
  ): Record<string, string> {
    const files: Record<string, string> = {};

    if (context.project.type === "fullstack") {
      files[".env.example"] = `API_URL=http://localhost:3000\n`;

      files["src/app/services/api-client.ts"] = `/**
 * API Client for backend communication.
 */

const API_URL = "http://localhost:3000";

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
