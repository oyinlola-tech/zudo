/**
 * Default version ranges for frontend dependencies the adapters request
 * without a version.
 *
 * Unpinned requirements used to be written as `"latest"`, so the same
 * scaffold produced a different dependency set every day. Every name a
 * built-in adapter requests unpinned has a caret range here (checked by
 * `tests/cli.round10.*.test.ts`). Ranges were taken from the npm registry on
 * 2026-09-19.
 */
export const DEFAULT_DEPENDENCY_VERSIONS: ReadonlyMap<string, string> = new Map(
  [
    ["@angular-builders/jest", "^22.0.1"],
    ["@angular/common", "^22.1.7"],
    ["@angular/core", "^22.1.7"],
    ["@ngrx/store", "^22.0.1"],
    ["@testing-library/jest-dom", "^7.0.1"],
    ["@testing-library/react", "^16.3.3"],
    ["@testing-library/react-native", "^14.0.1"],
    ["@testing-library/svelte", "^5.4.2"],
    ["@testing-library/user-event", "^14.6.7"],
    ["@vue/test-utils", "^2.5.1"],
    ["eslint", "^10.11.0"],
    ["eslint-plugin-react-hooks", "^7.1.1"],
    ["eslint-plugin-react-refresh", "^0.5.7"],
    ["eslint-plugin-svelte", "^3.23.0"],
    ["eslint-plugin-vue", "^10.11.0"],
    ["jest", "^30.5.2"],
    ["jsdom", "^30.1.0"],
    ["pinia", "^4.0.3"],
    ["prettier", "^3.9.8"],
    ["prettier-plugin-svelte", "^4.1.1"],
    ["react", "^19.3.0"],
    ["react-dom", "^19.3.0"],
    ["svelte", "^5.57.1"],
    ["typescript-eslint", "^8.70.0"],
    ["vitest", "^5.0.1"],
    ["vue", "^3.5.43"],
    ["zustand", "^5.0.15"],
  ],
);
