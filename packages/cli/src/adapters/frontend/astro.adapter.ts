/**
 * Astro frontend adapter.
 *
 * @module adapters/frontend/astro
 */

import { writeFileTree } from "../../utils/utils.fileSystem.js";
import { scaffoldWithFallback } from "../../scaffolders/scaffolder.helper.js";
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
    return "5.0.0";
  }

  async scaffold(context: FrontendGenerationContext): Promise<void> {
    const files = this.getBaseFiles(context);
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

  private getBaseFiles(
    context: FrontendGenerationContext,
  ): Record<string, string> {
    return {
      "package.json": JSON.stringify(
        {
          name: context.project.name,
          version: "0.1.0",
          private: true,
          type: "module",
          scripts: {
            dev: "astro dev",
            build: "astro build",
            preview: "astro preview",
          },
          dependencies: {
            astro: "^5.0.0",
          },
          devDependencies: {
            "@astrojs/check": "^0.9.0",
            typescript: "^5.0.0",
          },
        },
        null,
        2,
      ),
      "astro.config.mjs": `import { defineConfig } from "astro/config";

export default defineConfig({
  output: "static",
});
`,
      "tsconfig.json": JSON.stringify(
        {
          extends: "astro/tsconfigs/strict",
          compilerOptions: {
            strict: true,
          },
        },
        null,
        2,
      ),
      "src/layouts/Layout.astro": `---
interface Props {
  title: string;
}

const { title } = Astro.props;
---

<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>\${title}</title>
  </head>
  <body>
    <slot />
  </body>
</html>
`,
      "src/pages/index.astro": `---
import Layout from "../layouts/Layout.astro";
---

<Layout title="${context.project.name}">
  <h1>Hello from Zudojs</h1>
</Layout>
`,
    };
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
