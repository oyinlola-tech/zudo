/**
 * Built-in fallback templates the frontend adapters write when the
 * framework's official scaffolder cannot run (offline, registry errors,
 * timeouts). Every dependency range they write comes from
 * `resolvers/dependency/dependencyVersions.constant.ts`.
 *
 * @module adapters/frontend/fallback
 */

export {
  renderJsonFile,
  renderViteIndexHtml,
  versionFromRange,
  VITE_TSCONFIG_COMPILER_OPTIONS,
  type FallbackFileTree,
} from "./fallback.helper.js";
export {
  renderAngularFallback,
  renderAstroFallback,
  renderNextFallback,
  renderNuxtFallback,
  renderSvelteKitFallback,
} from "./framework/index.js";
export {
  renderReactFallback,
  renderSvelteFallback,
  renderVanillaFallback,
  renderVueFallback,
} from "./vite/index.js";
