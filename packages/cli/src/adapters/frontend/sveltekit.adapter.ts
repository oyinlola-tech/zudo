/**
 * SvelteKit frontend adapter.
 *
 * @module adapters/frontend/sveltekit
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
 * SvelteKit adapter with SSR support.
 */
export class SvelteKitAdapter implements FrontendAdapter {
  readonly name = "sveltekit";
  readonly framework = "sveltekit";

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async getLatestVersion(): Promise<string> {
    return "2.15.0";
  }

  async scaffold(context: FrontendGenerationContext): Promise<void> {
    const files = this.getBaseFiles(context);
    await scaffoldWithFallback({
      command: "npx",
      args: [
        "sv",
        "create",
        ".",
        "--template",
        "minimal",
        "--types",
        "ts",
        "--no-add-ons",
        "--no-install",
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
        { name: "@testing-library/svelte", type: "devDependency" },
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
            dev: "vite dev",
            build: "vite build",
            preview: "vite preview",
          },
          dependencies: {
            "@sveltejs/kit": "^2.15.0",
            svelte: "^5.0.0",
          },
          devDependencies: {
            "@sveltejs/vite-plugin-svelte": "^4.0.0",
            vite: "^6.0.0",
          },
        },
        null,
        2,
      ),
      "svelte.config.js": `import adapter from "@sveltejs/adapter-auto";

export default {
  kit: {
    adapter: adapter(),
  },
};
`,
      "vite.config.ts": `import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [sveltekit()],
});
`,
      "src/routes/+page.svelte": `<h1>Hello from Zudojs</h1>
`,
      "src/routes/+layout.svelte": `<slot />
`,
      "src/app.html": `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${context.project.name}</title>
  </head>
  <body>
    <div id="root"></div>
    {% include 'src/app.html' %}
  </body>
</html>
`,
    };
  }

  private getStructure(
    context: FrontendGenerationContext,
  ): Record<string, string> {
    return {
      "src/lib/.gitkeep": "",
      "src/lib/components/.gitkeep": "",
      "src/lib/utils/.gitkeep": "",
      "src/lib/types/index.ts": "// Types\nexport {};\n",
      "src/routes/.gitkeep": "",
      "static/.gitkeep": "",
    };
  }

  private getIntegrationFiles(
    context: FrontendGenerationContext,
  ): Record<string, string> {
    const files: Record<string, string> = {};

    if (context.project.type === "fullstack") {
      files[".env.example"] = `PUBLIC_API_URL=http://localhost:3000\n`;

      files["src/lib/services/api-client.ts"] = `/**
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
