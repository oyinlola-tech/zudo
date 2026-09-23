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

import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { generateMonolithFiles } from "../src/templates/monolith/index.js";
import { generateModularMonolithFiles } from "../src/templates/modular-monolith/index.js";
import { generateMicroserviceFiles } from "../src/templates/microservice/index.js";
import { generateResource } from "../src/generators/resource/index.js";
import { generateModule } from "../src/generators/module/index.js";
import { generateCommand } from "../src/generators/command/index.js";
import { generateQuery } from "../src/generators/query/index.js";
import { applyAppRecipe, FEATURE_RECIPES, type AppRecipe } from "../src/recipes/index.js";
import {
  buildPathMappings,
  generatedDiagnostics,
  removeScaffolds,
  scaffold,
  scaffoldOptions,
  typecheck,
} from "./helpers/generatedProject.helper.js";

afterAll(removeScaffolds);

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

/**
 * `generate command|query` wrote `BaseCommand`/`BaseQuery` classes and
 * handlers returning `{ success }` long after @zudojs/cqrs dropped those
 * names: a fresh project failed with TS2724/TS2305/TS2720. The usage file
 * registers both handlers and runs them through the real buses' types.
 */
describe("generated CQRS schematics", () => {
  it(
    "monolith: generate command widget + generate query widget type-check",
    async () => {
      const dir = await scaffold("cqrs", generateMonolithFiles(scaffoldOptions()));
      await generateCommand({ name: "widget", basePath: "src" }, dir);
      await generateQuery({ name: "widget", basePath: "src" }, dir);
      await generateCommand({ name: "create-order", basePath: "src" }, dir);
      await writeFile(
        join(dir, "src", "cqrs.usage.ts"),
        `import { createCommandBus, createQueryBus } from "@zudojs/cqrs";

import { createWidgetCommand, registerWidgetCommand, type WidgetCommandResult } from "./commands/widget/index.js";
import { createWidgetQuery, registerWidgetQuery, type WidgetQueryResult } from "./queries/widget/index.js";
import { CREATE_ORDER_COMMAND, CreateOrderCommandHandler } from "./commands/create-order/index.js";

export async function run(): Promise<readonly [WidgetCommandResult, WidgetQueryResult]> {
  const commands = registerWidgetCommand(createCommandBus());
  commands.register(CREATE_ORDER_COMMAND, new CreateOrderCommandHandler());
  const queries = registerWidgetQuery(createQueryBus());
  const created = await commands.execute<ReturnType<typeof createWidgetCommand>, WidgetCommandResult>(
    createWidgetCommand({ data: { name: "w" } }),
  );
  const found = await queries.execute<ReturnType<typeof createWidgetQuery>, WidgetQueryResult>(
    createWidgetQuery({ filter: { id: created.id } }),
  );
  return [created, found] as const;
}
`,
        "utf-8",
      );
      expect(generatedDiagnostics(await typecheck(dir))).toBe("");
    },
    300_000,
  );

  it(
    "monolith: generate service task then generate controller task type-checks",
    async () => {
      const dir = await scaffold("service-controller", generateMonolithFiles(scaffoldOptions()));
      const layout = { base: "src", appSrc: "src", appRoot: "", prisma: false };
      await generateResource({ name: "task", schematic: "service", layout }, dir);
      await generateResource({ name: "task", schematic: "controller", layout }, dir);
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
