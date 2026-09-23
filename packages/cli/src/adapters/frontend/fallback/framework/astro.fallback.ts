/**
 * Built-in Astro template, written when `create-astro` cannot run.
 *
 * @module adapters/frontend/fallback/framework/astro
 */

import {
  DEPENDENCY_VERSION_RANGES as V,
  TYPESCRIPT_VERSION_RANGES,
} from "../../../../resolvers/dependency/dependencyVersions.constant.js";
import type { FrontendGenerationContext } from "../../frontendAdapter.type.js";
import { renderJsonFile, type FallbackFileTree } from "../fallback.helper.js";

/**
 * Renders the Astro fallback project, matching `create-astro --template
 * minimal` plus a layout. `astro check` needs `@astrojs/check` and a
 * TypeScript 6 compiler.
 */
export function renderAstroFallback(
  context: FrontendGenerationContext,
): FallbackFileTree {
  return {
    "package.json": renderJsonFile({
      name: context.project.name,
      version: "0.1.0",
      private: true,
      type: "module",
      scripts: {
        dev: "astro dev",
        build: "astro build",
        preview: "astro preview",
        check: "astro check",
        astro: "astro",
      },
      dependencies: {
        astro: V.astro,
      },
      devDependencies: {
        "@astrojs/check": V["@astrojs/check"],
        typescript: TYPESCRIPT_VERSION_RANGES.frontend,
      },
    }),
    "astro.config.mjs": `// @ts-check
import { defineConfig } from "astro/config";

export default defineConfig({});
`,
    "tsconfig.json": renderJsonFile({
      extends: "astro/tsconfigs/strict",
      include: [".astro/types.d.ts", "**/*"],
      exclude: ["dist"],
    }),
    "src/layouts/Layout.astro": `---
interface Props {
  title: string;
}

const { title } = Astro.props;
---

<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width" />
    <meta name="generator" content={Astro.generator} />
    <title>{title}</title>
  </head>
  <body>
    <slot />
  </body>
</html>
`,
    "src/pages/index.astro": `---
import Layout from "../layouts/Layout.astro";
---

<Layout title=${JSON.stringify(context.project.name)}>
  <h1>Hello from Zudojs</h1>
</Layout>
`,
  };
}
