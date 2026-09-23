/**
 * zudojs-cli — Helpers for tests that compile or run generated projects.
 *
 * Projects are scaffolded into temporary directories outside the
 * repository. `typecheck` runs the real TypeScript compiler over one,
 * resolving every `@zudojs/*` import to that package's source in this
 * monorepo via `paths`. `generatedProject.runtime.helper.ts` links the
 * built packages instead, so a project can be compiled and run.
 */

import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { writeFileTree } from "../../src/utils/utils.fileSystem.js";
import type { ScaffoldOptions } from "../../src/types/index.js";

export const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

/** packages/cli/tests. */
export const TEST_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
/** packages/cli/tests → repository root. */
export const REPO_ROOT = resolve(TEST_DIR, "..", "..", "..");
export const PACKAGES_DIR = join(REPO_ROOT, "packages");

const createdDirs: string[] = [];

/** Removes every directory {@link scaffold} created. Call from `afterAll`. */
export async function removeScaffolds(): Promise<void> {
  const dirs = createdDirs.splice(0);
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
}

/** `create` options for a backend project, with `overrides` applied. */
export function scaffoldOptions(
  overrides: Partial<ScaffoldOptions> = {},
): ScaffoldOptions {
  return {
    projectName: "my-app",
    projectType: "backend",
    architecture: "monolith",
    packageManager: "pnpm",
    database: "postgresql",
    api: "rest",
    services: [],
    enableCQRS: true,
    enableMessaging: true,
    enableObservability: false,
    enableOpenAPI: false,
    enableDatabase: true,
    enableQueue: false,
    enableDocker: false,
    installDeps: false,
    initGit: false,
    ...overrides,
  };
}

/**
 * Maps every `@zudojs/<name>` specifier onto that package's entry source, so
 * generated code type-checks against the real framework with no node_modules.
 */
export async function buildPathMappings(): Promise<Record<string, string[]>> {
  const entries = await readdir(PACKAGES_DIR, { withFileTypes: true });
  const paths: Record<string, string[]> = {};

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === "cli") continue;

    const entryPoint = join(PACKAGES_DIR, entry.name, "src", "index.ts");
    if (!existsSync(entryPoint)) continue;

    paths[`@zudojs/${entry.name}`] = [entryPoint];
    paths[`@zudojs/${entry.name}/*`] = [
      join(PACKAGES_DIR, entry.name, "src", "*"),
    ];
  }

  // Generated tests import vitest, installed here for the CLI's own suite.
  paths["vitest"] = [join(TEST_DIR, "..", "node_modules", "vitest", "dist", "index.d.ts")];

  return paths;
}

/** Scaffolds a template into a fresh temp directory outside the repository. */
export async function scaffold(
  name: string,
  files: Record<string, string>,
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), `zudojs-generated-${name}-`));
  createdDirs.push(dir);
  await writeFileTree(dir, files);
  return dir;
}

/**
 * Locates the TypeScript compiler.
 *
 * TypeScript 7 does not expose `./bin/tsc` through package exports, so the
 * binary is resolved from the package directory rather than by specifier.
 */
export function resolveTscBinary(): string {
  const local = join(TEST_DIR, "..", "node_modules", ".bin", "tsc");
  if (existsSync(local)) return local;

  return join(dirname(require.resolve("typescript/package.json")), "bin", "tsc");
}

/** Runs tsc with `args` in `cwd`; returns its output (empty when clean). */
export async function runTsc(cwd: string, args: readonly string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync(resolveTscBinary(), [...args], {
      cwd,
      maxBuffer: 20 * 1024 * 1024,
    });
    return stdout.trim();
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string };
    return `${failure.stdout ?? ""}${failure.stderr ?? ""}`.trim();
  }
}

/** Runs tsc over a scaffolded project and returns its diagnostics. */
export async function typecheck(projectDir: string): Promise<string> {
  const configPath = join(projectDir, "tsconfig.typecheck.json");

  await writeFile(
    configPath,
    JSON.stringify(
      {
        extends: join(REPO_ROOT, "tsconfig.base.json"),
        compilerOptions: {
          noEmit: true,
          skipLibCheck: true,
          // TypeScript 7 removed `baseUrl`; absolute path targets work
          // without it. `moduleResolution` is inherited (NodeNext) on
          // purpose — overriding it breaks the base config's `module`.
          paths: await buildPathMappings(),
          lib: ["ES2022"],
          types: ["node"],
          typeRoots: [join(REPO_ROOT, "node_modules", "@types")],
          composite: false,
          declaration: false,
          declarationMap: false,
          sourceMap: false,
        },
        include: [
          // zudojs.config.ts lives at the project root.
          join(projectDir, "*.ts"),
          join(projectDir, "src/**/*.ts"),
          join(projectDir, "tests/**/*.ts"),
          join(projectDir, "apps/**/src/**/*.ts"),
          join(projectDir, "apps/**/tests/**/*.ts"),
        ],
      },
      null,
      2,
    ),
    "utf-8",
  );

  return runTsc(projectDir, ["-p", configPath]);
}

/**
 * Keeps only diagnostics reported in the generated project's own files.
 *
 * `@zudojs/*` imports resolve to package *source* here, and some packages
 * (e.g. `@zudojs/http`) are written against the DOM lib that a generated
 * Node project does not load. An installed project reads their built
 * `.d.ts` under `skipLibCheck`, so errors inside package sources say nothing
 * about the generated code. Paths outside the project print as `../…`.
 */
export function generatedDiagnostics(output: string): string {
  const kept: string[] = [];
  let keep = false;
  for (const line of output.split("\n")) {
    if (/^\S/.test(line)) keep = !line.startsWith("../");
    if (keep) kept.push(line);
  }
  return kept.join("\n").trim();
}
