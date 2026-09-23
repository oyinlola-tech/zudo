/**
 * Built-in fallback templates for the Vite-based frontends (React, Vue,
 * Svelte, vanilla), used when `create-vite` cannot run.
 *
 * @module adapters/frontend/fallback/vite
 */

export { renderReactFallback } from "./react.fallback.js";
export { renderSvelteFallback } from "./svelte.fallback.js";
export { renderVanillaFallback } from "./vanilla.fallback.js";
export { renderVueFallback } from "./vue.fallback.js";
