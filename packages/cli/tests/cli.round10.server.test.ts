/**
 * zudojs-cli — tooling/CLI-01: the generated server listens.
 *
 * The generated `server.ts` used to call `runtime.start()` and exit with 0
 * about 0.7 s later, serving nothing. This scaffolds a monolith outside the
 * repository (no install: `@zudojs/*` are symlinked to this monorepo's
 * packages), runs `src/server.ts` with tsx on a free port, requests
 * `/health`, and checks that SIGTERM shuts it down with exit code 0.
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
        const match = /Listening on port (\d+)/.exec(output);
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
    expect((await fetch(`http://127.0.0.1:${port}/missing`)).status).toBe(404);

    child.kill("SIGTERM");
    expect(await exited).toBe(0);
  }, 90_000);
});
