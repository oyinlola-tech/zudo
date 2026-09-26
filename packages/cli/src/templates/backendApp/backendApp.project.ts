/**
 * zudojs-cli — Project files shared by every backend architecture:
 * dependency lists, dev tooling, tsconfig, folder barrels and the database
 * setting every app records.
 */

import {
  DEPENDENCY_VERSION_RANGES,
  TYPESCRIPT_VERSION_RANGES,
} from "../../resolvers/dependency/dependencyVersions.constant.js";
import { MARKERS, insertBetweenMarkers } from "../../wiring/index.js";

/**
 * `@zudojs/*` packages the shared app source imports, plus `@zudojs/middleware`
 * (what @zudojs/http's middleware is built on; pnpm's strict layout does not
 * expose it transitively to an app that composes middleware of its own).
 */
export const APP_SOURCE_DEPENDENCIES: readonly string[] = [
  "@zudojs/config",
  "@zudojs/errors",
  "@zudojs/http",
  "@zudojs/middleware",
  "@zudojs/schema",
  "@zudojs/security",
];

/**
 * Scripts of a backend app. `typecheck` covers sources and tests; `build`
 * compiles the sources only. No `lint`: it used to repeat `tsc --noEmit`.
 */
export function backendAppScripts(): Record<string, string> {
  return {
    dev: "tsx watch src/server.ts",
    start: "node dist/server.js",
    build: "tsc",
    typecheck: "tsc --noEmit && tsc -p tsconfig.test.json",
    test: "vitest run",
  };
}

/** `@zudojs/*` packages the generated tests import. */
export const APP_TEST_DEPENDENCIES: readonly string[] = ["@zudojs/testing"];

/** Third-party dev tooling of a backend app. */
export function backendDevDependencies(): Record<string, string> {
  return {
    tsx: DEPENDENCY_VERSION_RANGES.tsx,
    typescript: TYPESCRIPT_VERSION_RANGES.backend,
    "@types/node": DEPENDENCY_VERSION_RANGES["@types/node"],
    vitest: DEPENDENCY_VERSION_RANGES.vitest,
  };
}

/**
 * tsconfig.test.json of a backend app: the same options over `src/` and
 * `tests/`, emitting nothing. `tsconfig.json` excludes the tests so `build`
 * never writes them to `dist/`; without this file they were never checked.
 */
export function backendTestTsconfig(): string {
  return `{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "rootDir": ".",
    "noEmit": true
  },
  "include": ["src/**/*", "tests/**/*"],
  "exclude": ["node_modules", "dist"]
}
`;
}

/** Every tsconfig of a backend app, keyed by file name. */
export function backendTsconfigFiles(): Record<string, string> {
  return { "tsconfig.json": backendTsconfig(), "tsconfig.test.json": backendTestTsconfig() };
}

/** tsconfig.json of a backend app: the build; tests are in tsconfig.test.json. */
export function backendTsconfig(): string {
  return `{
  "compilerOptions": {
    "target": "ES2024",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "lib": ["ES2024"],
    "types": ["node"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
`;
}

/** Folders every app has, each with an (initially empty) barrel. */
const APP_FOLDERS = [
  "constants", "controllers", "databases", "dtos", "enums", "errors", "events",
  "interfaces", "jobs", "loaders", "loggers", "middlewares", "models",
  "repositories", "services", "types", "validators",
] as const;

/** `src/<folder>/index.ts` barrels for {@link APP_FOLDERS}. */
export function emptyBarrels(): Record<string, string> {
  return Object.fromEntries(APP_FOLDERS.map((dir) => [`src/${dir}/index.ts`, ""]));
}

/** The config entry for the database URL. */
export const DATABASE_CONFIG_SECTION =
  `database: Object.freeze({ url: text(config, "database_url", "") }),`;

/**
 * Records the project's database URL: in `.env.example` (`envLines`, e.g.
 * `DATABASE_URL=postgresql://localhost:5432/shop`) and as the `database`
 * section of `src/configs/index.ts`.
 */
export function applyDatabaseSetting(
  files: Record<string, string>,
  envLines: string,
): Record<string, string> {
  const config = files["src/configs/index.ts"];
  if (config !== undefined) {
    files["src/configs/index.ts"] = insertBetweenMarkers(
      config,
      MARKERS.config,
      DATABASE_CONFIG_SECTION,
    ).source;
  }
  const env = files[".env.example"] ?? "";
  files[".env.example"] = `${env}${envLines}\n`;
  return files;
}

/** `<pm> run <script>` for a package manager. */
export function runCommand(packageManager: string, script: string): string {
  switch (packageManager) {
    case "npm":
      return `npm run ${script}`;
    case "yarn":
      return `yarn ${script}`;
    case "bun":
      return `bun run ${script}`;
    default:
      return `pnpm run ${script}`;
  }
}
