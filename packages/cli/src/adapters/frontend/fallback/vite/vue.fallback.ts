/**
 * Built-in Vue + Vite template, written when `create-vite` cannot run.
 *
 * @module adapters/frontend/fallback/vite/vue
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
 * Renders the Vue fallback project, mirroring `create-vite`'s `vue-ts`
 * (or `vue`) template. TypeScript projects typecheck with `vue-tsc`, which
 * understands `.vue` files, before Vite builds.
 */
export function renderVueFallback(
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
        build: useTypeScript ? "vue-tsc --noEmit && vite build" : "vite build",
        preview: "vite preview",
      },
      dependencies: {
        vue: V.vue,
      },
      devDependencies: {
        vite: V.vite,
        "@vitejs/plugin-vue": V["@vitejs/plugin-vue"],
        ...(useTypeScript
          ? {
              typescript: TYPESCRIPT_VERSION_RANGES.frontend,
              "vue-tsc": V["vue-tsc"],
              "@vue/tsconfig": V["@vue/tsconfig"],
            }
          : {}),
      },
    }),
    "vite.config.ts": `import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [vue()],
});
`,
    "index.html": renderViteIndexHtml(
      context.project.name,
      "app",
      `/src/main.${ext}`,
    ),
    [`src/main.${ext}`]: `import { createApp } from "vue";
import App from "./App.vue";

createApp(App).mount("#app");
`,
    "src/App.vue": `<script setup${useTypeScript ? ' lang="ts"' : ""}>
const title = "Hello from Zudojs";
</script>

<template>
  <div>
    <h1>{{ title }}</h1>
  </div>
</template>
`,
  };

  if (useTypeScript) {
    files["tsconfig.json"] = renderJsonFile({
      extends: "@vue/tsconfig/tsconfig.dom.json",
      compilerOptions: {
        types: ["vite/client"],
        noFallthroughCasesInSwitch: true,
      },
      include: ["src/**/*.ts", "src/**/*.tsx", "src/**/*.vue"],
    });
  }

  return files;
}
