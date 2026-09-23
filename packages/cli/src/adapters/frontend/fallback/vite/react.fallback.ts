/**
 * Built-in React + Vite template, written when `create-vite` cannot run.
 *
 * @module adapters/frontend/fallback/vite/react
 */

import {
  DEPENDENCY_VERSION_RANGES as V,
  TYPESCRIPT_VERSION_RANGES,
} from "../../../../resolvers/dependency/dependencyVersions.constant.js";
import type { FrontendGenerationContext } from "../../frontendAdapter.type.js";
import {
  renderJsonFile,
  renderViteIndexHtml,
  VITE_TSCONFIG_COMPILER_OPTIONS,
  type FallbackFileTree,
} from "../fallback.helper.js";

/**
 * Renders the React fallback project, mirroring `create-vite`'s `react-ts`
 * (or `react`) template.
 */
export function renderReactFallback(
  context: FrontendGenerationContext,
): FallbackFileTree {
  const useTypeScript = context.language === "typescript";
  const ext = useTypeScript ? "tsx" : "jsx";

  const files: FallbackFileTree = {
    "package.json": renderJsonFile({
      name: context.project.name,
      version: "0.1.0",
      private: true,
      type: "module",
      scripts: {
        dev: "vite",
        build: useTypeScript ? "tsc --noEmit && vite build" : "vite build",
        preview: "vite preview",
      },
      dependencies: {
        react: V.react,
        "react-dom": V["react-dom"],
      },
      devDependencies: {
        vite: V.vite,
        "@vitejs/plugin-react": V["@vitejs/plugin-react"],
        ...(useTypeScript
          ? {
              typescript: TYPESCRIPT_VERSION_RANGES.frontend,
              "@types/react": V["@types/react"],
              "@types/react-dom": V["@types/react-dom"],
            }
          : {}),
      },
    }),
    "vite.config.ts": `import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
});
`,
    "index.html": renderViteIndexHtml(
      context.project.name,
      "root",
      `/src/main.${ext}`,
    ),
    [`src/main.${ext}`]: `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.${ext}";

createRoot(document.getElementById("root")${useTypeScript ? "!" : ""}).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
`,
    [`src/App.${ext}`]: `export default function App() {
  return (
    <div>
      <h1>Hello from Zudojs</h1>
    </div>
  );
}
`,
  };

  if (useTypeScript) {
    files["tsconfig.json"] = renderJsonFile({
      compilerOptions: { ...VITE_TSCONFIG_COMPILER_OPTIONS, jsx: "react-jsx" },
      include: ["src"],
    });
  }

  return files;
}
