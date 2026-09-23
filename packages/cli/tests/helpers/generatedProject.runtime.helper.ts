/**
 * zudojs-cli — Helpers for tests that compile and run a generated project
 * against the built local `@zudojs/*` packages.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, symlink } from "node:fs/promises";
import { join } from "node:path";

import { PACKAGES_DIR, REPO_ROOT } from "./generatedProject.helper.js";

/** Whether every local package `names` has a built `dist/index.js`. */
export function packagesBuilt(names: readonly string[]): boolean {
  return names.every((name) => existsSync(join(PACKAGES_DIR, name, "dist", "index.js")));
}

/**
 * Links every local `@zudojs/*` package (its built `dist`, through its
 * package.json exports) and the repository's `@types` into the project's
 * node_modules, as a workspace install would.
 */
export async function linkLocalPackages(projectDir: string): Promise<void> {
  const scope = join(projectDir, "node_modules", "@zudojs");
  await mkdir(scope, { recursive: true });
  for (const entry of await readdir(PACKAGES_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (!existsSync(join(PACKAGES_DIR, entry.name, "package.json"))) continue;
    await symlink(join(PACKAGES_DIR, entry.name), join(scope, entry.name), "dir");
  }
  await symlink(
    join(REPO_ROOT, "node_modules", "@types"),
    join(projectDir, "node_modules", "@types"),
    "dir",
  );
}

/** A running process with its combined stdout and stderr. */
export interface RunningProcess {
  readonly child: ChildProcess;
  /** Everything written so far. */
  output(): string;
  /** Resolves once the output contains `text`; rejects after `timeoutMs`. */
  waitFor(text: string, timeoutMs?: number): Promise<void>;
  /** Resolves with the exit code and signal. */
  readonly exited: Promise<{ readonly code: number | null; readonly signal: NodeJS.Signals | null }>;
}

/** Starts `node <entry>` in `cwd` with `env` added to the environment. */
export function startNode(
  cwd: string,
  entry: string,
  env: Readonly<Record<string, string>>,
): RunningProcess {
  const child = spawn(process.execPath, [entry], {
    cwd,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let text = "";
  const waiters = new Set<() => void>();
  const append = (chunk: Buffer): void => {
    text += chunk.toString("utf-8");
    for (const check of [...waiters]) check();
  };
  child.stdout?.on("data", append);
  child.stderr?.on("data", append);

  let exit: { code: number | null; signal: NodeJS.Signals | null } | undefined;
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    child.on("close", (code, signal) => {
      exit = { code, signal };
      resolve(exit);
      for (const check of [...waiters]) check();
    });
  });

  const waitFor = (wanted: string, timeoutMs = 20_000): Promise<void> =>
    new Promise((resolve, reject) => {
      const fail = (reason: string): void => {
        clearTimeout(timer);
        waiters.delete(check);
        reject(new Error(`${reason} waiting for "${wanted}". Output:\n${text}`));
      };
      const timer = setTimeout(() => fail("Timed out"), timeoutMs);
      const check = (): void => {
        if (text.includes(wanted)) {
          clearTimeout(timer);
          waiters.delete(check);
          resolve();
        } else if (exit !== undefined) {
          fail(`Process exited (code ${String(exit.code)}, signal ${String(exit.signal)})`);
        }
      };
      waiters.add(check);
      check();
    });

  return { child, output: () => text, waitFor, exited };
}
