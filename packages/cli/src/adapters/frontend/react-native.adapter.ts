/**
 * React Native frontend adapter using Expo.
 *
 * @module adapters/frontend/react-native
 */

import { execCommand } from "../../utils/utils.exec.js";
import { writeFileTree } from "../../utils/utils.fileSystem.js";
import { scaffoldWithFallback } from "../../scaffolders/scaffolder.helper.js";
import type {
  FrontendAdapter,
  FrontendGenerationContext,
  DependencyRequirement,
  ValidationResult,
} from "./frontendAdapter.type.js";

/**
 * React Native adapter using Expo for cross-platform mobile development.
 */
export class ReactNativeAdapter implements FrontendAdapter {
  readonly name = "react-native";
  readonly framework = "react-native";

  async isAvailable(): Promise<boolean> {
    try {
      await execCommand("npx", ["expo", "--version"], ".");
      return true;
    } catch {
      return false;
    }
  }

  async getLatestVersion(): Promise<string> {
    return "57";
  }

  async scaffold(context: FrontendGenerationContext): Promise<void> {
    await scaffoldWithFallback({
      command: "npx",
      args: ["create-expo-app@latest", ".", "--template", "blank-typescript"],
      targetPath: context.projectPath,
      fallbackFiles: {},
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
        { name: "jest", type: "devDependency" },
        { name: "@testing-library/react-native", type: "devDependency" },
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
      "src/constants/.gitkeep": "",
      "src/hooks/.gitkeep": "",
      "src/navigation/.gitkeep": "",
      "src/screens/.gitkeep": "",
      "src/services/.gitkeep": "",
      "src/store/.gitkeep": "",
      "src/types/.gitkeep": "",
      "src/utils/.gitkeep": "",
    };
  }

  private getIntegrationFiles(
    context: FrontendGenerationContext,
  ): Record<string, string> {
    const files: Record<string, string> = {};

    if (context.project.type === "fullstack") {
      files[".env.example"] = `API_URL=http://localhost:3000\n`;

      files["src/config/api.config.ts"] =
        `import Constants from "expo-constants";

const API_URL = Constants.expoConfig?.extra?.apiUrl || "http://localhost:3000";

export const apiConfig = {
  baseUrl: API_URL,
};
`;

      files["src/services/api-client.ts"] = `/**
 * API Client for backend communication.
 */

import { apiConfig } from "../config/api.config";

export interface ApiResponse<T> {
  readonly data: T;
  readonly status: number;
}

export async function apiGet<T>(path: string): Promise<ApiResponse<T>> {
  const response = await fetch(\`\${apiConfig.baseUrl}\${path}\`);
  const data = await response.json() as T;
  return { data, status: response.status };
}

export async function apiPost<T>(path: string, body: unknown): Promise<ApiResponse<T>> {
  const response = await fetch(\`\${apiConfig.baseUrl}\${path}\`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json() as T;
  return { data, status: response.status };
}

export async function apiPut<T>(path: string, body: unknown): Promise<ApiResponse<T>> {
  const response = await fetch(\`\${apiConfig.baseUrl}\${path}\`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json() as T;
  return { data, status: response.status };
}

export async function apiDelete<T>(path: string): Promise<ApiResponse<T>> {
  const response = await fetch(\`\${apiConfig.baseUrl}\${path}\`, {
    method: "DELETE",
  });
  const data = await response.json() as T;
  return { data, status: response.status };
}
`;
    }

    return files;
  }
}
