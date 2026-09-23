/**
 * Built-in vanilla + Vite template, written when `create-vite` cannot run.
 *
 * @module adapters/frontend/fallback/vite/vanilla
 */

import { DEPENDENCY_VERSION_RANGES as V } from "../../../../resolvers/dependency/dependencyVersions.constant.js";
import type { FrontendGenerationContext } from "../../frontendAdapter.type.js";
import { renderJsonFile, type FallbackFileTree } from "../fallback.helper.js";

/**
 * Renders the vanilla fallback project. It used to ship no `package.json`
 * at all, so neither `install` nor `build` could run in it.
 */
export function renderVanillaFallback(
  context: FrontendGenerationContext,
): FallbackFileTree {
  return {
    "package.json": renderJsonFile({
      name: context.project.name,
      version: "0.1.0",
      private: true,
      type: "module",
      scripts: {
        dev: "vite",
        build: "vite build",
        preview: "vite preview",
      },
      devDependencies: {
        vite: V.vite,
      },
    }),
    "index.html": `<!doctype html>
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
