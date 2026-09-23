/**
 * Runs every lesson example the way a learner would on their own computer
 * and compares what it prints with the output shown on the page.
 *
 *  - Packages come from the npm registry (not the workspace), installed once
 *    into a cache folder: exactly what `npm install @zudojs/…` gives a learner.
 *  - .js files run with `node`, .ts files with `tsx`; every .ts example must
 *    also pass `tsc --noEmit`, unless it is marked check="tsc-error", in which
 *    case the pretty tsc output must match the page.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { extractExamples } from "./source.mjs";

/* What `npm install -D typescript tsx @types/node` gives a learner today. */
const TOOLING = { typescript: "latest", tsx: "latest", "@types/node": "latest" };
const DEFAULT_TSCONFIG = {
  compilerOptions: {
    target: "ES2024",
    module: "NodeNext",
    moduleResolution: "NodeNext",
    strict: true,
    skipLibCheck: true,
    types: ["node"],
    noEmit: true,
    verbatimModuleSyntax: true,
  },
};

const ANSI = /\x1b\[[0-9;]*m/g;

export function normalize(text) {
  return text
    .replace(ANSI, "")
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .join("\n")
    .replace(/\n+$/, "")
    .replace(/^\n+/, "");
}

function zudoImports(lessons) {
  const pkgs = new Set();
  for (const lesson of lessons) {
    for (const ex of extractExamples(lesson)) {
      for (const m of ex.code.matchAll(/from\s+["'](@zudojs\/[\w-]+)["']/g)) pkgs.add(m[1]);
    }
  }
  return [...pkgs].sort();
}

function ensureDeps(lessons, log) {
  const deps = {};
  for (const p of zudoImports(lessons)) deps[p] = "latest";
  const pkg = { name: "zudo-learn-check", private: true, type: "module", dependencies: deps, devDependencies: TOOLING };
  const day = new Date().toISOString().slice(0, 10);
  const key = createHash("sha256").update(JSON.stringify(pkg) + day).digest("hex").slice(0, 12);
  const dir = join(tmpdir(), "zudo-learn-deps-" + key);
  if (!existsSync(join(dir, "node_modules", ".bin", "tsx"))) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "package.json"), JSON.stringify(pkg, null, 2));
    log(`installing ${Object.keys(deps).length} @zudojs packages + tooling from npm into ${dir}`);
    const r = spawnSync("npm", ["install", "--no-audit", "--no-fund", "--loglevel=error"], { cwd: dir, encoding: "utf8" });
    if (r.status !== 0) throw new Error("npm install failed:\n" + r.stderr);
  }
  return dir;
}

/* Merged stdout+stderr in write order: run through a shell with 2>&1. */
function runMerged(command, cwd) {
  const r = spawnSync("sh", ["-c", command + " 2>&1"], {
    cwd,
    encoding: "utf8",
    timeout: 30000,
    env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0", NODE_NO_WARNINGS: "1" },
  });
  return { status: r.status, text: r.stdout || "" };
}

function diff(want, got) {
  const a = want.split("\n");
  const b = got.split("\n");
  const lines = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] === b[i]) lines.push("    " + (a[i] ?? ""));
    else {
      if (a[i] !== undefined) lines.push("  - " + a[i]);
      if (b[i] !== undefined) lines.push("  + " + b[i]);
    }
  }
  return lines.join("\n");
}

export function checkNode(lessons, { log = console.log, only = null } = {}) {
  const deps = ensureDeps(lessons, log);
  const bin = join(deps, "node_modules", ".bin");
  const results = [];
  const work = mkdtempSync(join(tmpdir(), "zudo-learn-run-"));

  for (const lesson of lessons) {
    if (only && lesson.slug !== only) continue;
    const examples = extractExamples(lesson);
    const dirs = new Map();
    const projectDir = (ex, i) => {
      const key = ex.project || "solo-" + i;
      if (!dirs.has(key)) {
        const d = join(work, lesson.slug, key);
        mkdirSync(d, { recursive: true });
        symlinkSync(join(deps, "node_modules"), join(d, "node_modules"), "dir");
        writeFileSync(join(d, "package.json"), JSON.stringify({ type: "module" }, null, 2));
        writeFileSync(join(d, "tsconfig.json"), JSON.stringify(DEFAULT_TSCONFIG, null, 2));
        dirs.set(key, d);
      }
      return dirs.get(key);
    };

    examples.forEach((ex, i) => {
      const dir = projectDir(ex, i);
      const target = join(dir, ex.file);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, ex.code + "\n");
      if (ex.tag === "file" || ex.check === "skip") return;
      const isTs = /\.(ts|mts)$/.test(ex.file);
      const label = `${lesson.slug} #${i} ${ex.file}`;

      if (ex.check === "tsc-error") {
        const r = runMerged(`${join(bin, "tsc")} --noEmit --pretty`, dir);
        const got = normalize(r.text);
        const want = ex.expected ? normalize(ex.expected) : null;
        const ok = r.status !== 0 && (want === null || want === got);
        results.push({ label, ok, detail: ok ? "" : r.status === 0 ? "expected a type error, tsc passed" : diff(want, got) });
        rmSync(target);
        return;
      }

      if (isTs) {
        const t = runMerged(`${join(bin, "tsc")} --noEmit --pretty`, dir);
        if (t.status !== 0) {
          results.push({ label: label + " (tsc)", ok: false, detail: normalize(t.text) });
          return;
        }
      }

      if (ex.expected === null) return;
      const cmd = isTs ? `${join(bin, "tsx")} ${ex.file}` : `node ${ex.file}`;
      const r = runMerged(cmd, dir);
      const got = normalize(r.text);
      const want = normalize(ex.expected);
      const ok = got === want;
      results.push({ label, ok, detail: ok ? "" : diff(want, got) });
    });
  }

  rmSync(work, { recursive: true, force: true });
  return results;
}

