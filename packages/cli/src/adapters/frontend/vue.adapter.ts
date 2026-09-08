/**
 * Vue frontend adapter using Vite.
 *
 * @module adapters/frontend/vue
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
 * Vue adapter using Vite as the build tool.
 */
export class VueAdapter implements FrontendAdapter {
  readonly name = "vue";
  readonly framework = "vue";

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async getLatestVersion(): Promise<string> {
    return "3.5.0";
  }

  async scaffold(context: FrontendGenerationContext): Promise<void> {
    const files = this.getBaseFiles(context);
    await scaffoldWithFallback({
      command: "npm",
      args: [
        "create",
        "vite@latest",
        ".",
        "--",
        "--template",
        context.language === "javascript" ? "vue" : "vue-ts",
      ],
      targetPath: context.projectPath,
      fallbackFiles: files,
    });
  }

  getDependencies(
    context: FrontendGenerationContext,
  ): readonly DependencyRequirement[] {
    const deps: DependencyRequirement[] = [{ name: "vue", type: "dependency" }];

    if (context.features.testing) {
      deps.push(
        { name: "vitest", type: "devDependency" },
        { name: "@vue/test-utils", type: "devDependency" },
        { name: "jsdom", type: "devDependency" },
      );
    }

    if (context.features.linting) {
      deps.push(
        { name: "eslint", type: "devDependency" },
        { name: "eslint-plugin-vue", type: "devDependency" },
      );
    }

    if (context.features.formatting) {
      deps.push({ name: "prettier", type: "devDependency" });
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
    const useTypeScript = context.language === "typescript";

    return {
      "package.json": JSON.stringify(
        {
          name: context.project.name,
          version: "0.1.0",
          private: true,
          type: "module",
          scripts: {
            dev: "vite",
            build: "vite build",
            preview: "vite preview",
          },
          dependencies: {
            vue: "^3.5.0",
          },
          devDependencies: {
            vite: "^6.0.0",
            "@vitejs/plugin-vue": "^4.5.0",
            ...(useTypeScript ? { typescript: "^5.0.0" } : {}),
          },
        },
        null,
        2,
      ),
      "vite.config.ts": `import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
});
`,
      "tsconfig.json": JSON.stringify(
        {
          compilerOptions: {
            target: "ES2020",
            useDefineForClassFields: true,
            lib: ["ES2020", "DOM", "DOM.Iterable"],
            module: "ESNext",
            skipLibCheck: true,
            moduleResolution: "bundler",
            allowImportingTsExtensions: true,
            resolveJsonModule: true,
            strict: true,
          },
        },
        null,
        2,
      ),
      "index.html": `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${context.project.name}</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`,
      "src/main.ts": `import { createApp } from "vue";
import App from "./App.vue";

createApp(App).mount("#app");
`,
      "src/App.vue": `<template>
  <div>
    <h1>Hello from Zudojs</h1>
  </div>
</template>

<script setup lang="ts">
</script>
`,
      ...(useTypeScript
        ? { "src/vite-env.d.ts": `/// <reference types="vite/client" />\n` }
        : {}),
    };
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
      [`${srcDir}/composables/.gitkeep`]: "",
      [`${srcDir}/configs/index.ts`]: "// Configuration\nexport {};\n",
      [`${srcDir}/constants/index.ts`]: "// Constants\nexport {};\n",
      [`${srcDir}/hooks/.gitkeep`]: "",
      [`${srcDir}/layouts/.gitkeep`]: "",
      [`${srcDir}/pages/.gitkeep`]: "",
      [`${srcDir}/router/index.ts`]: "// Router\nexport {};\n",
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
      [`${srcDir}/composables/.gitkeep`]: "",
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
