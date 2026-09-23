/**
 * Version ranges for every third-party package a generated project depends
 * on: the ranges adapters request without a version, the framework
 * toolchains the built-in fallback templates write, and the backend
 * templates' dev tooling.
 *
 * Unpinned requirements used to be written as `"latest"`, so the same
 * scaffold produced a different dependency set every day, and the fallback
 * templates carried their own literals that went stale independently (Vite
 * 6, Next 15, Nuxt 3, Angular 19 and TypeScript 5 long after newer majors
 * shipped). Every range now lives here. Every name a built-in adapter
 * requests unpinned must have an entry (checked by
 * `tests/cli.round10.*.test.ts`). Ranges were taken from the npm registry on
 * 2026-09-23; pre-releases (for example Prisma 8 RCs or `@nuxt/devtools`
 * betas tagged `latest`) are never used.
 */
export const DEPENDENCY_VERSION_RANGES = Object.freeze({
  "@angular/build": "^22.1.8",
  "@angular/cli": "^22.1.8",
  "@angular/common": "^22.1.7",
  "@angular/compiler": "^22.1.7",
  "@angular/compiler-cli": "^22.1.7",
  "@angular/core": "^22.1.7",
  "@angular/forms": "^22.1.7",
  "@angular/platform-browser": "^22.1.7",
  "@angular/router": "^22.1.7",
  "@astrojs/check": "^0.9.10",
  "@ngrx/store": "^22.0.1",
  "@prisma/adapter-pg": "^7.10.0",
  "@prisma/client": "^7.10.0",
  "@sveltejs/adapter-auto": "^7.0.1",
  "@sveltejs/kit": "^2.70.3",
  "@sveltejs/vite-plugin-svelte": "^7.3.1",
  "@testing-library/dom": "^10.4.2",
  "@testing-library/jest-dom": "^7.0.1",
  "@testing-library/react": "^16.3.3",
  "@testing-library/react-native": "^14.0.1",
  "@testing-library/svelte": "^5.4.2",
  "@testing-library/user-event": "^14.6.7",
  "@tsconfig/svelte": "^5.0.8",
  "@types/node": "^26.6.2",
  "@types/react": "^19.3.0",
  "@types/react-dom": "^19.3.0",
  "@types/ws": "^8.18.1",
  "@vitejs/plugin-react": "^6.1.1",
  "@vitejs/plugin-vue": "^6.0.9",
  "@vue/test-utils": "^2.5.1",
  "@vue/tsconfig": "^0.9.1",
  astro: "^7.3.4",
  eslint: "^10.11.0",
  "eslint-plugin-react-hooks": "^7.1.1",
  "eslint-plugin-react-refresh": "^0.5.7",
  "eslint-plugin-svelte": "^3.23.0",
  "eslint-plugin-vue": "^10.11.0",
  jest: "^30.5.2",
  jsdom: "^30.1.1",
  next: "^16.3.6",
  nodemailer: "^10.0.10",
  nuxt: "^4.5.2",
  pinia: "^4.0.3",
  prettier: "^3.9.9",
  // Prisma 7 stable. npm's `latest` tag points at an 8.0 release
  // candidate; a caret range never selects a pre-release.
  prisma: "^7.10.0",
  "prettier-plugin-svelte": "^4.1.1",
  react: "^19.3.0",
  "react-dom": "^19.3.0",
  redis: "^6.2.1",
  rxjs: "~7.8.2",
  svelte: "^5.57.1",
  "svelte-check": "^4.7.6",
  tslib: "^2.8.1",
  tsx: "^4.23.15",
  "typescript-eslint": "^8.70.1",
  vite: "^8.3.0",
  vitest: "^5.0.1",
  vue: "^3.5.43",
  "vue-router": "^5.3.1",
  "vue-tsc": "^3.3.11",
  ws: "^8.21.3",
  zustand: "^5.0.15",
} as const);

/**
 * TypeScript ranges, split by where the compiler runs.
 *
 * Backend templates only run `tsc` and `tsx`, so they get TypeScript 7.
 * Frontend toolchains call the TypeScript 6 JavaScript API and declare it
 * as a peer: `@angular/compiler-cli` and `@angular/build` need
 * `>=6.0 <6.1`, `typescript-eslint` needs `<6.1.0`, and `@sveltejs/kit`,
 * `svelte-check` and `@astrojs/check` need `^5 || ^6`. The frontend range is
 * therefore a tilde range on 6.0 — do not raise it to 7 until those peer
 * ranges admit it.
 */
export const TYPESCRIPT_VERSION_RANGES = Object.freeze({
  backend: "^7.0.2",
  frontend: "~6.0.3",
} as const);

/**
 * Vitest range for Angular projects. `@angular/build:unit-test` declares
 * `vitest` `^4.0.8` as a peer, so Angular cannot take the Vitest 5 range the
 * other frameworks use.
 */
export const ANGULAR_VITEST_VERSION_RANGE = "^4.1.11";

/**
 * Default ranges the dependency resolver applies to requirements that carry
 * no version of their own.
 */
export const DEFAULT_DEPENDENCY_VERSIONS: ReadonlyMap<string, string> = new Map(
  Object.entries(DEPENDENCY_VERSION_RANGES),
);
