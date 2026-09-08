/**
 * Angular frontend adapter.
 *
 * @module adapters/frontend/angular
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
 * Angular adapter with standalone support.
 */
export class AngularAdapter implements FrontendAdapter {
  readonly name = "angular";
  readonly framework = "angular";

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async getLatestVersion(): Promise<string> {
    return "19.0.0";
  }

  async scaffold(context: FrontendGenerationContext): Promise<void> {
    const files = this.getBaseFiles(context);
    // Angular CLI requires a valid project name; "." is not one. Pass the
    // real name and scaffold into the current directory via --directory.
    const projectName =
      context.project.name
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/^-+|-+$/g, "") || "zudojs-app";
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
        "--standalone",
      ],
      targetPath: context.projectPath,
      fallbackFiles: files,
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
      deps.push(
        { name: "@angular/core", type: "dependency" },
        { name: "@angular/common", type: "dependency" },
        { name: "jest", type: "devDependency" },
        { name: "@angular-builders/jest", type: "devDependency" },
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
          version: "0.0.0",
          private: true,
          scripts: {
            start: "ng serve",
            build: "ng build",
            test: "ng test",
          },
          dependencies: {
            "@angular/animations": "^19.0.0",
            "@angular/common": "^19.0.0",
            "@angular/compiler": "^19.0.0",
            "@angular/core": "^19.0.0",
            "@angular/forms": "^19.0.0",
            "@angular/platform-browser": "^19.0.0",
            "@angular/platform-browser-dynamic": "^19.0.0",
            "@angular/router": "^19.0.0",
            rxjs: "~7.8.0",
            tslib: "^2.3.0",
            "zone.js": "~0.15.0",
          },
          devDependencies: {
            "@angular-devkit/build-angular": "^19.0.0",
            "@angular/cli": "^19.0.0",
            "@angular/compiler-cli": "^19.0.0",
            "@types/jasmine": "~5.1.0",
            "jasmine-core": "~5.1.0",
            karma: "~6.4.0",
            typescript: "~5.6.0",
          },
        },
        null,
        2,
      ),
      "tsconfig.json": JSON.stringify(
        {
          compileOnSave: false,
          compilerOptions: {
            outDir: "./dist/out-tsc",
            strict: true,
            noImplicitOverride: true,
            noPropertyAccessFromIndexSignature: true,
            noImplicitReturns: true,
            noFallthroughCasesInSwitch: true,
            esModuleInterop: true,
            sourceMap: true,
            declaration: false,
            downlevelIteration: true,
            experimentalDecorators: true,
            moduleResolution: "bundler",
            importHelpers: true,
            target: "ES2022",
            module: "ES2022",
            lib: ["ES2022", "dom"],
            useDefineForClassFields: true,
          },
          angularCompilerOptions: {
            enableI18nLegacyMessageIdFormat: false,
            strictInjectionParameters: true,
            strictInputAccessModifiers: true,
            strictTemplates: true,
          },
        },
        null,
        2,
      ),
      "src/main.ts": `import { bootstrapApplication } from "@angular/platform-browser";
import { AppComponent } from "./app/app.component";

bootstrapApplication(AppComponent);
`,
      "src/index.html": `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${context.project.name}</title>
    <base href="/" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" type="image/x-icon" href="/favicon.ico" />
  </head>
  <body>
    <app-root></app-root>
  </body>
</html>
`,
      "src/app/app.component.ts": `import { Component } from "@angular/core";

@Component({
  selector: "app-root",
  standalone: true,
  template: "<h1>Hello from Zudojs</h1>",
})
export class AppComponent {}
`,
    };
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
