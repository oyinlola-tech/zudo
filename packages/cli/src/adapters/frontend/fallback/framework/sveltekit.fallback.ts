/**
 * Built-in SvelteKit template, written when `sv create` cannot run.
 *
 * @module adapters/frontend/fallback/framework/sveltekit
 */

import {
  DEPENDENCY_VERSION_RANGES as V,
  TYPESCRIPT_VERSION_RANGES,
} from "../../../../resolvers/dependency/dependencyVersions.constant.js";
import type { FrontendGenerationContext } from "../../frontendAdapter.type.js";
import { renderJsonFile, type FallbackFileTree } from "../fallback.helper.js";

/**
 * Renders the SvelteKit fallback project, matching `sv create --template
 * minimal --types ts`. The previous fallback had an `app.html` without the
 * `%sveltekit.head%`/`%sveltekit.body%` placeholders and imported
 * `@sveltejs/adapter-auto` without depending on it, so it could not build.
 */
export function renderSvelteKitFallback(
  context: FrontendGenerationContext,
): FallbackFileTree {
  return {
    "package.json": renderJsonFile({
      name: context.project.name,
      version: "0.1.0",
      private: true,
      type: "module",
      scripts: {
        dev: "vite dev",
        build: "vite build",
        preview: "vite preview",
        prepare: "svelte-kit sync || echo ''",
        check: "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json",
      },
      devDependencies: {
        "@sveltejs/adapter-auto": V["@sveltejs/adapter-auto"],
        "@sveltejs/kit": V["@sveltejs/kit"],
        "@sveltejs/vite-plugin-svelte": V["@sveltejs/vite-plugin-svelte"],
        svelte: V.svelte,
        "svelte-check": V["svelte-check"],
        typescript: TYPESCRIPT_VERSION_RANGES.frontend,
        vite: V.vite,
      },
    }),
    "vite.config.ts": `import adapter from "@sveltejs/adapter-auto";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [sveltekit({ adapter: adapter() })],
});
`,
    "tsconfig.json": renderJsonFile({
      extends: "./.svelte-kit/tsconfig.json",
      compilerOptions: {
        rewriteRelativeImportExtensions: true,
        allowJs: true,
        checkJs: true,
        esModuleInterop: true,
        forceConsistentCasingInFileNames: true,
        resolveJsonModule: true,
        skipLibCheck: true,
        sourceMap: true,
        strict: true,
        moduleResolution: "bundler",
      },
    }),
    "src/app.html": `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    %sveltekit.head%
  </head>
  <body data-sveltekit-preload-data="hover">
    <div style="display: contents">%sveltekit.body%</div>
  </body>
</html>
`,
    "src/app.d.ts": `// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
  namespace App {}
}

export {};
`,
    "src/routes/+layout.svelte": `<script lang="ts">
  let { children } = $props();
</script>

<svelte:head>
  <title>${context.project.name}</title>
</svelte:head>

{@render children()}
`,
    "src/routes/+page.svelte": `<h1>Hello from Zudojs</h1>
`,
  };
}
