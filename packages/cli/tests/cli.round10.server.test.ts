/**
 * zudojs-cli — tooling/CLI-01: the generated server listens.
 *
 * The generated `server.ts` used to call `runtime.start()` and exit with 0
 * about 0.7 s later, serving nothing. This scaffolds a monolith outside the
 * repository (no install: `@zudojs/*` are symlinked to this monorepo's
 * packages), runs `src/server.ts` with tsx on a free port, requests
 * `/health`, the example resource, the OpenAPI document and the security
 * headers, and checks that SIGTERM shuts it down with exit code 0.
 */

import { spawn } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

import { generateMonolithFiles } from "../src/templates/monolith/index.js";
import { writeFileTree } from "../src/utils/utils.fileSystem.js";
import type { ScaffoldOptions } from "../src/types/index.js";

const CLI_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGES_DIR = resolve(CLI_DIR, "..");
const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

async function scaffold(): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "zudojs-r10-server-"));
  dirs.push(dir);
  const options = {
    projectName: "srv",
    projectType: "backend",
    architecture: "monolith",
    packageManager: "pnpm",
    database: "postgresql",
    services: [],
    installDeps: false,
    initGit: false,
    enableOpenAPI: true,
  } as unknown as ScaffoldOptions;
  await writeFileTree(dir, generateMonolithFiles(options));
  mkdirSync(join(dir, "node_modules", "@zudojs"), { recursive: true });
  for (const name of readdirSync(PACKAGES_DIR)) {
    if (name !== "cli")
      symlinkSync(
        join(PACKAGES_DIR, name),
        join(dir, "node_modules", "@zudojs", name),
      );
  }
  return dir;
}

describe("tooling/CLI-01", () => {
  it("serves /health on PORT until SIGTERM, then exits 0", async () => {
    const dir = await scaffold();
    const child = spawn(
      join(CLI_DIR, "node_modules", ".bin", "tsx"),
      ["src/server.ts"],
      {
        cwd: dir,
        env: { ...process.env, PORT: "0", HOST: "127.0.0.1", NODE_ENV: "test" },
      },
    );
    const exited = new Promise<number | null>((done) =>
      child.once("exit", (code) => done(code)),
    );
    let output = "";
    const port = await new Promise<number>((done, fail) => {
      const timer = setTimeout(
        () => fail(new Error(`server did not listen:\n${output}`)),
        45_000,
      );
      const onData = (chunk: Buffer): void => {
        output += chunk.toString();
        const match = /Listening on http:\/\/[^\s]+:(\d+)/.exec(output);
        if (match) {
          clearTimeout(timer);
          done(Number(match[1]));
        }
      };
      child.stdout.on("data", onData);
      child.stderr.on("data", onData);
      void exited.then((code) =>
        fail(new Error(`server exited early (${code}):\n${output}`)),
      );
    });

    const health = await fetch(`http://127.0.0.1:${port}/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ status: "ok" });
    expect(health.headers.get("x-content-type-options")).toBe("nosniff");
    expect(health.headers.get("x-frame-options")).toBe("DENY");
    expect((await fetch(`http://127.0.0.1:${port}/missing`)).status).toBe(404);

    const base = `http://127.0.0.1:${port}/api/v1/examples`;
    const created = await fetch(base, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Ada", id: "attacker-chosen" }),
    });
    expect(created.status).toBe(201);
    const record = (await created.json()) as { id: string; name: string };
    expect(record.name).toBe("Ada");
    expect(record.id).not.toBe("attacker-chosen");
    expect((await fetch(`${base}/${record.id}`)).status).toBe(200);
    expect((await fetch(`${base}/00000000-0000-4000-8000-000000000000`)).status).toBe(404);
    expect((await fetch(`${base}/not-a-uuid`)).status).toBe(400);
    const invalid = await fetch(base, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    expect(invalid.status).toBe(400);

    const openapi = await fetch(`http://127.0.0.1:${port}/openapi.json`);
    expect(openapi.status).toBe(200);
    const document = (await openapi.json()) as { paths: Record<string, unknown> };
    expect(Object.keys(document.paths)).toContain("/api/v1/examples/{id}");
    expect(Object.keys(document.paths)).not.toContain("/health");
    const docs = await fetch(`http://127.0.0.1:${port}/docs`);
    expect(docs.status).toBe(200);
    expect(docs.headers.get("content-security-policy")).toContain("cdn.jsdelivr.net");

    child.kill("SIGTERM");
    expect(await exited).toBe(0);
  }, 90_000);
});
