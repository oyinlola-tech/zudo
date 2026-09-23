/**
 * Built-in fallback templates for the frontends that ship their own
 * toolchain (Next.js, Nuxt, SvelteKit, Astro, Angular), used when the
 * official scaffolder cannot run.
 *
 * @module adapters/frontend/fallback/framework
 */

export { renderAngularFallback } from "./angular/index.js";
export { renderAstroFallback } from "./astro.fallback.js";
export { renderNextFallback } from "./next.fallback.js";
export { renderNuxtFallback } from "./nuxt.fallback.js";
export { renderSvelteKitFallback } from "./sveltekit.fallback.js";
