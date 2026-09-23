/**
 * Built-in Nuxt template, written when `nuxi init` cannot run.
 *
 * @module adapters/frontend/fallback/framework/nuxt
 */

import { DEPENDENCY_VERSION_RANGES as V } from "../../../../resolvers/dependency/dependencyVersions.constant.js";
import type { FrontendGenerationContext } from "../../frontendAdapter.type.js";
import { renderJsonFile, type FallbackFileTree } from "../fallback.helper.js";

/**
 * Renders the Nuxt 4 fallback project, matching `nuxi init --template
 * minimal`: application code lives in `app/`, and the TypeScript project
 * references point at the configs `nuxt prepare` generates in `.nuxt/`.
 */
export function renderNuxtFallback(
  context: FrontendGenerationContext,
): FallbackFileTree {
  return {
    "package.json": renderJsonFile({
      name: context.project.name,
      version: "0.1.0",
      private: true,
      type: "module",
      scripts: {
        build: "nuxt build",
        dev: "nuxt dev",
        generate: "nuxt generate",
        preview: "nuxt preview",
        postinstall: "nuxt prepare",
      },
      dependencies: {
        nuxt: V.nuxt,
        vue: V.vue,
        "vue-router": V["vue-router"],
      },
    }),
    "nuxt.config.ts": `// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: true },
});
`,
    "tsconfig.json": renderJsonFile({
      files: [],
      references: [
        { path: "./.nuxt/tsconfig.app.json" },
        { path: "./.nuxt/tsconfig.server.json" },
        { path: "./.nuxt/tsconfig.shared.json" },
        { path: "./.nuxt/tsconfig.node.json" },
      ],
    }),
    "app/app.vue": `<template>
  <div>
    <h1>Hello from Zudojs</h1>
  </div>
</template>
`,
  };
}
