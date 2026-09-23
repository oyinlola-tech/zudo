/**
 * Workspace configuration (`angular.json`, tsconfigs) for the built-in
 * Angular fallback.
 *
 * @module adapters/frontend/fallback/framework/angular/workspace
 */

import { renderJsonFile, type FallbackFileTree } from "../../fallback.helper.js";

/**
 * Renders the Angular CLI workspace file `ng new` 22 writes. Builds, the dev
 * server and unit tests all go through `@angular/build`; the deprecated
 * `@angular-devkit/build-angular` and its Karma/Jasmine test runner are no
 * longer used.
 *
 * @param projectName - The normalised project name used as the project key.
 * @param packageManager - Recorded as the CLI's package manager.
 */
export function renderAngularWorkspace(
  projectName: string,
  packageManager: string,
): string {
  return renderJsonFile({
    $schema: "./node_modules/@angular/cli/lib/config/schema.json",
    version: 1,
    cli: { packageManager },
    newProjectRoot: "projects",
    projects: {
      [projectName]: {
        projectType: "application",
        schematics: {},
        root: "",
        sourceRoot: "src",
        prefix: "app",
        architect: {
          build: {
            builder: "@angular/build:application",
            options: {
              browser: "src/main.ts",
              tsConfig: "tsconfig.app.json",
              assets: [{ glob: "**/*", input: "public" }],
              styles: ["src/styles.css"],
            },
            configurations: {
              production: {
                budgets: [
                  {
                    type: "initial",
                    maximumWarning: "500kB",
                    maximumError: "1MB",
                  },
                  {
                    type: "anyComponentStyle",
                    maximumWarning: "4kB",
                    maximumError: "8kB",
                  },
                ],
                outputHashing: "all",
              },
              development: {
                optimization: false,
                extractLicenses: false,
                sourceMap: true,
              },
            },
            defaultConfiguration: "production",
          },
          serve: {
            builder: "@angular/build:dev-server",
            configurations: {
              production: { buildTarget: `${projectName}:build:production` },
              development: { buildTarget: `${projectName}:build:development` },
            },
            defaultConfiguration: "development",
          },
          test: {
            builder: "@angular/build:unit-test",
          },
        },
      },
    },
  });
}

/**
 * Renders the solution-style tsconfigs `ng new` 22 writes: a base config
 * referencing an app config and a Vitest spec config.
 */
export function renderAngularTsconfigs(): FallbackFileTree {
  return {
    "tsconfig.json": renderJsonFile({
      compileOnSave: false,
      compilerOptions: {
        noImplicitOverride: true,
        noPropertyAccessFromIndexSignature: true,
        noImplicitReturns: true,
        noFallthroughCasesInSwitch: true,
        skipLibCheck: true,
        isolatedModules: true,
        experimentalDecorators: true,
        importHelpers: true,
        strict: true,
        target: "ES2022",
        module: "preserve",
      },
      angularCompilerOptions: {
        enableI18nLegacyMessageIdFormat: false,
        strictInjectionParameters: true,
        strictInputAccessModifiers: true,
        strictTemplates: true,
      },
      files: [],
      references: [
        { path: "./tsconfig.app.json" },
        { path: "./tsconfig.spec.json" },
      ],
    }),
    "tsconfig.app.json": renderJsonFile({
      extends: "./tsconfig.json",
      compilerOptions: { types: [] },
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.spec.ts"],
    }),
    "tsconfig.spec.json": renderJsonFile({
      extends: "./tsconfig.json",
      compilerOptions: { types: ["vitest/globals"] },
      include: ["src/**/*.d.ts", "src/**/*.spec.ts"],
    }),
  };
}
