/**
 * zudojs-cli — Round 12: the generated server at runtime.
 *
 * Scaffolds a monolith outside the repository, links the built `@zudojs/*`
 * packages, compiles it with its own tsconfig (and tsconfig.test.json, so
 * the generated tests are type-checked too), then runs `dist/server.js`
 * twice: once as production and once as development.
 *
 * - #13: an error thrown below a route is logged and answered with a
 *   generic 500 that still carries the security headers.
 * - #141: list endpoints paginate (`?limit=&cursor=`), `/docs` is not served
 *   in production, and `RATE_LIMIT_MAX=0` disables the rate limit while a
 *   positive value still enforces it.
 */

import { existsSync } from "node:fs";
import { readFile, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { generateModule } from "../src/generators/module/index.js";
import { generateResource } from "../src/generators/resource/index.js";
import { generateValidator } from "../src/generators/validator/index.js";
import { generateMonolithFiles } from "../src/templates/monolith/index.js";
import {
  removeScaffolds,
  runTsc,
  scaffold,
  scaffoldOptions,
  TEST_DIR,
} from "./helpers/generatedProject.helper.js";
import {
  linkLocalPackages,
  packagesBuilt,
  startNode,
  type RunningProcess,
} from "./helpers/generatedProject.runtime.helper.js";

afterAll(removeScaffolds);

const RUNTIME_PACKAGES = [
  "core", "runtime", "http", "logger", "config", "security", "errors", "schema", "constants", "container", "events", "openapi",
];

interface Page {
  readonly items: readonly { readonly id: string; readonly name: string }[];
  readonly nextCursor: string | null;
}

async function prepare(): Promise<string> {
  const dir = await scaffold(
    "round12",
    generateMonolithFiles(
      scaffoldOptions({ enableCQRS: false, enableMessaging: false, enableDatabase: false, enableOpenAPI: true }),
    ),
  );
  const repository = join(dir, "src/repositories/examples.repository.ts");
  const source = await readFile(repository, "utf-8");
  const marker = "  public async create(input: CreateExampleInput): Promise<Example> {\n";
  expect(source).toContain(marker);
  await writeFile(
    repository,
    source.replace(marker, `${marker}    if (input.name === "boom") throw new Error("repository exploded");\n`),
  );

  const layout = { base: "src", appSrc: "src", appRoot: "", prisma: false };
  await generateValidator({ name: "payment", basePath: "src" }, dir);
  await generateModule({ name: "billing", basePath: "src/modules" }, dir);
  await generateResource(
    { name: "invoices", schematic: "resource", layout: { ...layout, base: "src/modules/billing" } },
    dir,
  );

  await linkLocalPackages(dir);
  const vitest = join(TEST_DIR, "..", "node_modules", "vitest");
  if (existsSync(vitest)) await symlink(vitest, join(dir, "node_modules", "vitest"), "dir");
  return dir;
}

async function listen(dir: string, env: Record<string, string>): Promise<{ server: RunningProcess; base: string }> {
  const server = startNode(dir, "dist/server.js", { HOST: "127.0.0.1", PORT: "0", ...env });
  await server.waitFor("Listening on http://127.0.0.1:");
  const port = /Listening on http:\/\/127\.0\.0\.1:(\d+)/.exec(server.output())?.[1];
  return { server, base: `http://127.0.0.1:${port}` };
}

async function stop(server: RunningProcess): Promise<void> {
  server.child.kill("SIGTERM");
  setTimeout(() => server.child.kill("SIGKILL"), 15_000).unref();
  await server.exited;
}

async function create(base: string, name: string): Promise<Response> {
  return fetch(`${base}/api/v1/examples`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

describe.skipIf(!packagesBuilt(RUNTIME_PACKAGES))("generated server (round 12)", () => {
  it(
    "compiles (sources and tests), logs unexpected errors, paginates, hides /docs in production",
    async () => {
      const dir = await prepare();
      expect(await runTsc(dir, ["-p", "tsconfig.json"])).toBe("");
      expect(await runTsc(dir, ["-p", "tsconfig.test.json"])).toBe("");

      const production = await listen(dir, { NODE_ENV: "production", RATE_LIMIT_MAX: "0" });
      try {
        const { base } = production;

        // #13: the throw below the route is logged, the client gets a generic 500
        // with the security headers, and the server keeps serving.
        const failed = await create(base, "boom");
        expect(failed.status).toBe(500);
        expect(await failed.json()).toEqual({ error: "Internal Server Error" });
        expect(failed.headers.get("x-content-type-options")).toBe("nosniff");
        expect(failed.headers.get("x-frame-options")).toBe("DENY");
        expect(production.server.output()).toContain("repository exploded");
        expect(production.server.output()).toContain("POST /api/v1/examples");
        expect((await fetch(`${base}/health`)).status).toBe(200);

        // #141: pagination.
        const ids: string[] = [];
        for (const name of ["Ada", "Grace", "Linus"]) {
          const created = await create(base, name);
          expect(created.status).toBe(201);
          ids.push(((await created.json()) as { id: string }).id);
        }
        const first = await fetch(`${base}/api/v1/examples?limit=2`);
        expect(first.status).toBe(200);
        const page1 = (await first.json()) as Page;
        expect(page1.items.map((item) => item.id)).toEqual(ids.slice(0, 2));
        expect(page1.nextCursor).toBe(ids[1]);
        const page2 = (await (await fetch(`${base}/api/v1/examples?limit=2&cursor=${page1.nextCursor}`)).json()) as Page;
        expect(page2.items.map((item) => item.id)).toEqual(ids.slice(2));
        expect(page2.nextCursor).toBeNull();
        expect((await fetch(`${base}/api/v1/examples?limit=0`)).status).toBe(400);
        expect((await fetch(`${base}/api/v1/examples?limit=abc`)).status).toBe(400);
        const unknownCursor = (await (await fetch(`${base}/api/v1/examples?cursor=00000000-0000-4000-8000-000000000000`)).json()) as Page;
        expect(unknownCursor).toEqual({ items: [], nextCursor: null });

        // #141: /docs is not served in production, the document still is;
        // RATE_LIMIT_MAX=0 never answers 429.
        expect((await fetch(`${base}/docs`)).status).toBe(404);
        expect((await fetch(`${base}/openapi.json`)).status).toBe(200);
        const statuses = await Promise.all(
          Array.from({ length: 30 }, () => fetch(`${base}/health`).then((r) => r.status)),
        );
        expect(new Set(statuses)).toEqual(new Set([200]));
      } finally {
        await stop(production.server);
      }
      expect(production.server.output()).toContain("Received SIGTERM: shutting down.");

      const development = await listen(dir, { NODE_ENV: "development", RATE_LIMIT_MAX: "2" });
      try {
        const { base } = development;
        expect((await fetch(`${base}/docs`)).status).toBe(200);
        const statuses: number[] = [];
        for (let i = 0; i < 4; i += 1) statuses.push((await fetch(`${base}/health`)).status);
        expect(statuses).toContain(429);
      } finally {
        await stop(development.server);
      }
    },
    240_000,
  );
});
