/**
 * Vanilla HTML/CSS/JS frontend adapter.
 *
 * @module adapters/frontend/vanilla
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
 * Vanilla HTML/CSS/JS adapter with no framework.
 */
export class VanillaAdapter implements FrontendAdapter {
  readonly name = "vanilla";
  readonly framework = "vanilla";

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async getLatestVersion(): Promise<string> {
    return "1.0.0";
  }

  async scaffold(context: FrontendGenerationContext): Promise<void> {
    const files = this.getBaseFiles(context);
    await scaffoldWithFallback({
      command: "npm",
      args: ["create", "vite@latest", ".", "--", "--template", "vanilla-ts"],
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

    if (context.features.linting) {
      deps.push({ name: "eslint", type: "devDependency" });
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
    return {
      "index.html": `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${context.project.name}</title>
  <link rel="stylesheet" href="/src/styles/main.css">
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/src/main.js"></script>
</body>
</html>
`,
      "src/main.js": `import { createApp } from "./app.js";

const app = createApp();
app.mount("#app");
`,
      "src/app.js": `export function createApp() {
  return {
    mount(selector) {
      const root = document.querySelector(selector);
      if (root) {
        root.innerHTML = "<h1>Hello from Zudojs</h1>";
      }
    },
  };
}
`,
      "src/styles/main.css": `* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: system-ui, -apple-system, sans-serif;
  line-height: 1.6;
}
`,
    };
  }

  private getStructure(
    context: FrontendGenerationContext,
  ): Record<string, string> {
    return {
      "src/components/.gitkeep": "",
      "src/utils/.gitkeep": "",
      "src/services/.gitkeep": "",
    };
  }

  private getIntegrationFiles(
    context: FrontendGenerationContext,
  ): Record<string, string> {
    const files: Record<string, string> = {};

    if (context.project.type === "fullstack") {
      files[".env.example"] = `API_URL=http://localhost:3000\n`;

      files["src/services/api-client.js"] = `/**
 * API Client for backend communication.
 */

const API_URL = "http://localhost:3000";

export async function apiGet(path) {
  const response = await fetch(\`\${API_URL}\${path}\`);
  const data = await response.json();
  return { data, status: response.status };
}

export async function apiPost(path, body) {
  const response = await fetch(\`\${API_URL}\${path}\`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  return { data, status: response.status };
}
`;
    }

    return files;
  }
}
