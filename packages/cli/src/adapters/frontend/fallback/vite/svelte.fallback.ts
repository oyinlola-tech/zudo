/**
 * Built-in Svelte + Vite template, written when `create-vite` cannot run.
 *
 * @module adapters/frontend/fallback/vite/svelte
 */

import {
  DEPENDENCY_VERSION_RANGES as V,
  TYPESCRIPT_VERSION_RANGES,
} from "../../../../resolvers/dependency/dependencyVersions.constant.js";
import type { FrontendGenerationContext } from "../../frontendAdapter.type.js";
import {
  renderJsonFile,
  renderViteIndexHtml,
  type FallbackFileTree,
} from "../fallback.helper.js";

/**
 * Renders the Svelte 5 fallback project, mirroring `create-vite`'s
 * `svelte-ts` (or `svelte`) template: components are mounted with
 * `mount()`, since Svelte 5 removed `new App({ target })`.
 */
export function renderSvelteFallback(
  context: FrontendGenerationContext,
): FallbackFileTree {
  const useTypeScript = context.language === "typescript";
  const ext = useTypeScript ? "ts" : "js";

  const files: FallbackFileTree = {
    "package.json": renderJsonFile({
      name: context.project.name,
      version: "0.1.0",
      private: true,
      type: "module",
      scripts: {
        dev: "vite",
        build: "vite build",
        preview: "vite preview",
        ...(useTypeScript
          ? { check: "svelte-check --tsconfig ./tsconfig.json" }
          : {}),
      },
      dependencies: {
        svelte: V.svelte,
      },
      devDependencies: {
        vite: V.vite,
        "@sveltejs/vite-plugin-svelte": V["@sveltejs/vite-plugin-svelte"],
        ...(useTypeScript
          ? {
              typescript: TYPESCRIPT_VERSION_RANGES.frontend,
              "svelte-check": V["svelte-check"],
              "@tsconfig/svelte": V["@tsconfig/svelte"],
            }
          : {}),
      },
    }),
    "svelte.config.js": `/** @type {import("@sveltejs/vite-plugin-svelte").SvelteConfig} */
export default {};
`,
    "vite.config.ts": `import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [svelte()],
});
`,
    "index.html": renderViteIndexHtml(
      context.project.name,
      "app",
      `/src/main.${ext}`,
    ),
    [`src/main.${ext}`]: `import { mount } from "svelte";
import App from "./App.svelte";

const app = mount(App, {
  target: document.getElementById("app")${useTypeScript ? "!" : ""},
});

export default app;
`,
    "src/App.svelte": `<script${useTypeScript ? ' lang="ts"' : ""}>
  const title = "Hello from Zudojs";
</script>

<main>
  <h1>{title}</h1>
</main>

<style>
  main {
    font-family: system-ui, -apple-system, sans-serif;
  }
</style>
`,
  };

  if (useTypeScript) {
    files["tsconfig.json"] = renderJsonFile({
      extends: "@tsconfig/svelte/tsconfig.json",
      compilerOptions: {
        target: "ES2023",
        module: "ESNext",
        types: ["svelte", "vite/client"],
        noEmit: true,
        moduleDetection: "force",
      },
      include: ["src/**/*.ts", "src/**/*.js", "src/**/*.svelte"],
    });
  }

  return files;
}
