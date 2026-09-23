/**
 * Shared pieces of the built-in fallback templates.
 *
 * @module adapters/frontend/fallback/helper
 */

/** A generated file tree: project-relative path to file contents. */
export type FallbackFileTree = Record<string, string>;

/** Serialises a JSON config file the way the official scaffolders do. */
export function renderJsonFile(value: unknown): string {
  return JSON.stringify(value, null, 2) + "\n";
}

/**
 * Renders the `index.html` entry page Vite serves and builds from.
 *
 * @param title - The document title (the project name).
 * @param mountId - The id of the element the app mounts into.
 * @param entry - The root-relative module script, e.g. `/src/main.ts`.
 */
export function renderViteIndexHtml(
  title: string,
  mountId: string,
  entry: string,
): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
  </head>
  <body>
    <div id="${mountId}"></div>
    <script type="module" src="${entry}"></script>
  </body>
</html>
`;
}

/**
 * Compiler options shared by the Vite fallbacks, mirroring the
 * `tsconfig.app.json` that `create-vite` 9 writes.
 */
export const VITE_TSCONFIG_COMPILER_OPTIONS = Object.freeze({
  target: "ES2023",
  lib: ["ES2023", "DOM", "DOM.Iterable"],
  module: "ESNext",
  types: ["vite/client"],
  skipLibCheck: true,
  moduleResolution: "bundler",
  allowImportingTsExtensions: true,
  verbatimModuleSyntax: true,
  moduleDetection: "force",
  noEmit: true,
  strict: true,
  noFallthroughCasesInSwitch: true,
});

/**
 * Returns the lowest version a caret or tilde range admits, which is the
 * release the range was written against (`"^8.3.0"` → `"8.3.0"`).
 */
export function versionFromRange(range: string): string {
  return range.replace(/^[\^~]/, "");
}
