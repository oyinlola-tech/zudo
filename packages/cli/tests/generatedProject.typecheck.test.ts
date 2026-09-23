/**
 * zudojs-cli — Generated Project Typecheck Tests
 *
 * `zudojs create` used to emit projects that could not start: the templates
 * imported a `logger` binding `@zudojs/logger` does not export and called
 * `createRuntime` with one argument instead of two. Nothing caught it because
 * nothing compiled the generated output.
 *
 * These tests scaffold each architecture into a temporary directory and run
 * the real TypeScript compiler over it, resolving every `@zudojs/*` import to
 * that package's source in this monorepo via `paths`. No install is performed
 * and nothing is written inside the repository.
 */

import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";

import { generateMonolithFiles } from "../src/templates/monolith/index.js";
import { generateModularMonolithFiles } from "../src/templates/modular-monolith/index.js";
import { generateMicroserviceFiles } from "../src/templates/microservice/index.js";
import { writeFileTree } from "../src/utils/utils.fileSystem.js";
import { generateResource } from "../src/generators/resource/index.js";
import { generateModule } from "../src/generators/module/index.js";
import { applyAppRecipe, FEATURE_RECIPES, type AppRecipe } from "../src/recipes/index.js";
import type { ScaffoldOptions } from "../src/types/index.js";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
/** packages/cli/tests → repository root. */
const REPO_ROOT = resolve(TEST_DIR, "..", "..", "..");
const PACKAGES_DIR = join(REPO_ROOT, "packages");

const createdDirs: string[] = [];

afterAll(async () => {
  await Promise.all(
    createdDirs.map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

function scaffoldOptions(
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
async function buildPathMappings(): Promise<Record<string, string[]>> {
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
async function scaffold(
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
function resolveTscBinary(): string {
  const local = join(TEST_DIR, "..", "node_modules", ".bin", "tsc");
  if (existsSync(local)) return local;

  return join(dirname(require.resolve("typescript/package.json")), "bin", "tsc");
}

/** Runs tsc over a scaffolded project and returns its diagnostics. */
async function typecheck(projectDir: string): Promise<string> {
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

  try {
    const { stdout } = await execFileAsync(resolveTscBinary(), ["-p", configPath], {
      cwd: projectDir,
      maxBuffer: 20 * 1024 * 1024,
    });
    return stdout.trim();
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string };
    return `${failure.stdout ?? ""}${failure.stderr ?? ""}`.trim();
  }
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
function generatedDiagnostics(output: string): string {
  const kept: string[] = [];
  let keep = false;
  for (const line of output.split("\n")) {
    if (/^\S/.test(line)) keep = !line.startsWith("../");
    if (keep) kept.push(line);
  }
  return kept.join("\n").trim();
}

const architectures: ReadonlyArray<
  readonly [string, () => Record<string, string>]
> = [
  ["monolith", () => generateMonolithFiles(scaffoldOptions())],
  [
    "modular-monolith",
    () =>
      generateModularMonolithFiles(
        scaffoldOptions({
          architecture: "modular-monolith",
          services: ["identity", "billing"],
        }),
      ),
  ],
  [
    "microservice",
    () =>
      generateMicroserviceFiles(
        scaffoldOptions({
          architecture: "microservice",
          services: ["identity", "billing"],
        }),
      ),
  ],
];

describe.each(architectures)(
  "generated %s project",
  (name, generate) => {
    it(
      "type-checks against the real @zudojs packages",
      async () => {
        const dir = await scaffold(name, generate());
        const diagnostics = generatedDiagnostics(await typecheck(dir));
        expect(diagnostics, `${name} generated project failed to compile`).toBe(
          "",
        );
      },
      300_000,
    );
  },
);

/**
 * Recipes whose code imports only `@zudojs/*` and Node built-ins, so they
 * can be type-checked here without installing anything. The redis, ws,
 * nodemailer and Prisma recipes are type-checked by the end-to-end run
 * against an installed project.
 */
const OFFLINE_RECIPES = ["queue", "scheduler", "cache", "messaging", "observability", "storage", "openapi"];

async function addOfflineRecipes(dir: string, appRoot: string): Promise<void> {
  for (const feature of OFFLINE_RECIPES) {
    const recipe = FEATURE_RECIPES[feature] as AppRecipe;
    await applyAppRecipe(
      recipe,
      { projectSlug: "my-app", appName: "app", database: "postgresql", appRoot },
      dir,
    );
  }
}

describe("generated projects after generate and add", () => {
  it(
    "monolith: generate resource users + every offline recipe type-checks",
    async () => {
      const dir = await scaffold("monolith-wired", generateMonolithFiles(scaffoldOptions()));
      const layout = { base: "src", appSrc: "src", appRoot: "", prisma: false };
      await generateResource({ name: "users", schematic: "resource", layout }, dir);
      await generateResource({ name: "order-items", schematic: "route", layout }, dir);
      await addOfflineRecipes(dir, "");
      expect(generatedDiagnostics(await typecheck(dir))).toBe("");
    },
    300_000,
  );

  it(
    "modular monolith: generate module + resource --module type-checks",
    async () => {
      const dir = await scaffold(
        "modular-wired",
        generateModularMonolithFiles(scaffoldOptions({ architecture: "modular-monolith", services: [] })),
      );
      await generateModule({ name: "billing", basePath: "src/modules" }, dir);
      await generateResource(
        {
          name: "invoices",
          schematic: "resource",
          layout: { base: "src/modules/billing", appSrc: "src", appRoot: "", prisma: false },
        },
        dir,
      );
      expect(generatedDiagnostics(await typecheck(dir))).toBe("");
    },
    300_000,
  );

  it(
    "microservice: generate resource in a service type-checks",
    async () => {
      const dir = await scaffold(
        "micro-wired",
        generateMicroserviceFiles(scaffoldOptions({ architecture: "microservice", services: ["identity"] })),
      );
      const appRoot = "apps/services/identity";
      await generateResource(
        {
          name: "users",
          schematic: "resource",
          layout: { base: `${appRoot}/src`, appSrc: `${appRoot}/src`, appRoot, prisma: false },
        },
        dir,
      );
      await addOfflineRecipes(dir, appRoot);
      expect(generatedDiagnostics(await typecheck(dir))).toBe("");
    },
    300_000,
  );
});

describe("generated project imports", () => {
  it("only names packages that exist in this monorepo", async () => {
    const known = new Set(Object.keys(await buildPathMappings()));

    for (const [, generate] of architectures) {
      for (const [path, content] of Object.entries(generate())) {
        if (!path.endsWith(".ts")) continue;
        for (const match of content.matchAll(/from "(@zudojs\/[^"]+)"/g)) {
          expect(known.has(match[1] ?? ""), `${path} → ${match[1]}`).toBe(true);
        }
      }
    }
  });

  it("declares every @zudojs package it imports as a dependency", () => {
    for (const [, generate] of architectures) {
      const files = generate();

      const manifests = Object.entries(files).filter(([p]) =>
        p.endsWith("package.json"),
      );

      for (const [sourcePath, content] of Object.entries(files)) {
        if (!sourcePath.endsWith(".ts")) continue;

        const imported = [
          ...content.matchAll(/from "(@zudojs\/[^"/]+)"/g),
        ].map((m) => m[1] ?? "");
        if (imported.length === 0) continue;

        // The nearest package.json above this source file owns its deps.
        const owner = manifests
          .filter(([manifestPath]) =>
            sourcePath.startsWith(manifestPath.replace(/package\.json$/, "")),
          )
          .sort((a, b) => b[0].length - a[0].length)[0];

        expect(owner, `no package.json owns ${sourcePath}`).toBeDefined();

        const pkg = JSON.parse(owner?.[1] ?? "{}") as {
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
        };
        // Tests may use dev dependencies (@zudojs/testing); src may not.
        const declared = Object.keys({
          ...pkg.dependencies,
          ...(/(^|\/)tests\//.test(sourcePath) ? pkg.devDependencies : {}),
        });

        for (const dep of imported) {
          expect(declared, `${sourcePath} imports ${dep}`).toContain(dep);
        }
      }
    }
  });
});
