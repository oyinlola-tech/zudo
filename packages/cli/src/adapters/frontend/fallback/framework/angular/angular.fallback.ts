/**
 * Built-in Angular template, written when `ng new` cannot run.
 *
 * @module adapters/frontend/fallback/framework/angular
 */

import {
  ANGULAR_VITEST_VERSION_RANGE,
  DEPENDENCY_VERSION_RANGES as V,
  TYPESCRIPT_VERSION_RANGES,
} from "../../../../../resolvers/dependency/dependencyVersions.constant.js";
import type { FrontendGenerationContext } from "../../../frontendAdapter.type.js";
import { renderJsonFile, type FallbackFileTree } from "../../fallback.helper.js";
import {
  renderAngularTsconfigs,
  renderAngularWorkspace,
} from "./angularWorkspace.fallback.js";

/**
 * Renders the Angular 22 fallback project, matching `ng new --routing
 * --style css`: a zoneless standalone app built by `@angular/build` and
 * tested with Vitest. The previous fallback had no `angular.json`, so
 * `ng build` could not run in it.
 *
 * @param context - The generation context.
 * @param projectName - The normalised name `ng new` would receive.
 */
export function renderAngularFallback(
  context: FrontendGenerationContext,
  projectName: string,
): FallbackFileTree {
  return {
    "package.json": renderJsonFile({
      name: context.project.name,
      version: "0.0.0",
      private: true,
      scripts: {
        ng: "ng",
        start: "ng serve",
        build: "ng build",
        watch: "ng build --watch --configuration development",
        test: "ng test",
      },
      dependencies: {
        "@angular/common": V["@angular/common"],
        "@angular/compiler": V["@angular/compiler"],
        "@angular/core": V["@angular/core"],
        "@angular/forms": V["@angular/forms"],
        "@angular/platform-browser": V["@angular/platform-browser"],
        "@angular/router": V["@angular/router"],
        rxjs: V.rxjs,
        tslib: V.tslib,
      },
      devDependencies: {
        "@angular/build": V["@angular/build"],
        "@angular/cli": V["@angular/cli"],
        "@angular/compiler-cli": V["@angular/compiler-cli"],
        jsdom: V.jsdom,
        typescript: TYPESCRIPT_VERSION_RANGES.frontend,
        vitest: ANGULAR_VITEST_VERSION_RANGE,
      },
    }),
    "angular.json": renderAngularWorkspace(projectName, context.packageManager),
    ...renderAngularTsconfigs(),
    "public/.gitkeep": "",
    "src/styles.css": "",
    "src/index.html": `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${context.project.name}</title>
  <base href="/">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body>
  <app-root></app-root>
</body>
</html>
`,
    "src/main.ts": `import { bootstrapApplication } from "@angular/platform-browser";
import { appConfig } from "./app/app.config";
import { App } from "./app/app";

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
`,
    "src/app/app.config.ts": `import { type ApplicationConfig, provideBrowserGlobalErrorListeners } from "@angular/core";
import { provideRouter } from "@angular/router";
import { routes } from "./app.routes";

export const appConfig: ApplicationConfig = {
  providers: [provideBrowserGlobalErrorListeners(), provideRouter(routes)],
};
`,
    "src/app/app.routes.ts": `import type { Routes } from "@angular/router";

export const routes: Routes = [];
`,
    "src/app/app.ts": `import { Component } from "@angular/core";
import { RouterOutlet } from "@angular/router";

@Component({
  selector: "app-root",
  imports: [RouterOutlet],
  template: "<h1>Hello from Zudojs</h1><router-outlet />",
})
export class App {}
`,
    "src/app/app.spec.ts": `import { TestBed } from "@angular/core/testing";
import { App } from "./app";

describe("App", () => {
  it("creates the app", async () => {
    await TestBed.configureTestingModule({ imports: [App] }).compileComponents();
    expect(TestBed.createComponent(App).componentInstance).toBeTruthy();
  });
});
`,
  };
}
