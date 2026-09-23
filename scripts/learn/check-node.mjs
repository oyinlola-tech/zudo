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
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { extractExamples } from "./source.mjs";

/* What `npm install -D typescript tsx @types/node` gives a learner today. */
const TOOLING = { typescript: "latest", tsx: "latest", "@types/node": "latest" };
export const DEFAULT_TSCONFIG = {
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

/*
 * Parts of an output that change on every run. <output mask="ms,iso"> hides
 * them on both sides before comparing, so the page can show a real run.
 */
export const MASKS = {
  ms: [/\b\d+(?:\.\d+)?\s?ms\b/g, "<ms>"],
  s: [/\b\d+(?:\.\d+)?s\b/g, "<s>"],
  iso: [/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?/g, "<iso>"],
  time: [/\b\d{1,2}:\d{2}:\d{2}(?:\.\d+)?(?:\s?[AP]M)?/g, "<time>"],
  epoch: [/\b1\d{9}(?:\d{3})?\b/g, "<epoch>"],
  uuid: [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<uuid>"],
  hex: [/\b[0-9a-f]{16,}\b/gi, "<hex>"],
  b64: [/[A-Za-z0-9_\-+/]{20,}={0,2}/g, "<b64>"],
  jwt: [/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, "<jwt>"],
  port: [/:\d{4,5}\b/g, ":<port>"],
  pid: [/\bpid[:= ]\s*\d+/gi, "pid <pid>"],
  num: [/\b\d+(?:\.\d+)?\b/g, "<n>"],
};

/** Applies an <output mask="…"> list (comma separated MASKS names) to a text. */
export function applyMasks(text, mask) {
  if (!mask) return text;
  let out = text;
  for (const name of mask.split(",").map((x) => x.trim()).filter(Boolean)) {
    const m = MASKS[name];
    if (!m) throw new Error(`unknown output mask "${name}" (known: ${Object.keys(MASKS).join(", ")})`);
    /* Applied in the order listed: put specific masks (jwt, uuid, iso) before generic ones (hex, b64, num). */
    out = out.replace(m[0], m[1]);
  }
  return out;
}

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

/*
 * Every published @zudojs package plus course.json check.dependencies, so the
 * cache key stays the same while lessons are being written (several checks can
 * run at once and share one install).
 */
function allDependencies(lessons, root) {
  const deps = {};
  if (root) {
    const course = JSON.parse(readFileSync(join(root, "site-src", "learn", "course.json"), "utf8"));
    const skip = new Set((course.check && course.check.unpublished) || []);
    for (const dir of readdirSync(join(root, "packages")).sort()) {
      if (skip.has("packages/" + dir)) continue;
      const file = join(root, "packages", dir, "package.json");
      if (!existsSync(file)) continue;
      const pkg = JSON.parse(readFileSync(file, "utf8"));
      if (!pkg.private && pkg.name.startsWith("@zudojs/")) deps[pkg.name] = "latest";
    }
    Object.assign(deps, (course.check && course.check.dependencies) || {});
  }
  for (const p of zudoImports(lessons)) deps[p] ??= "latest";
  return deps;
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function ensureDeps(lessons, log, root) {
  const deps = allDependencies(lessons, root);
  const pkg = { name: "zudo-learn-check", private: true, type: "module", dependencies: deps, devDependencies: TOOLING };
  /* course.json check.refresh: change it to reinstall today (e.g. right after a release). */
  if (root) {
    const course = JSON.parse(readFileSync(join(root, "site-src", "learn", "course.json"), "utf8"));
    if (course.check && course.check.refresh) pkg.zudoLearnRefresh = course.check.refresh;
  }
  const day = new Date().toISOString().slice(0, 10);
  const key = createHash("sha256").update(JSON.stringify(pkg) + day).digest("hex").slice(0, 12);
  const dir = join(tmpdir(), "zudo-learn-deps-" + key);
  const done = join(dir, ".installed");
  const lock = dir + ".lock";
  while (!existsSync(done)) {
    try {
      mkdirSync(lock);
    } catch {
      /* another check is installing: wait for it (a lock older than 10 minutes is stale) */
      if (Date.now() - statSync(lock).mtimeMs > 600000) rmSync(lock, { recursive: true, force: true });
      else sleepSync(1000);
      continue;
    }
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "package.json"), JSON.stringify(pkg, null, 2));
      log(`installing ${Object.keys(deps).length} packages + tooling from npm into ${dir}`);
      const r = spawnSync("npm", ["install", "--no-audit", "--no-fund", "--loglevel=error"], { cwd: dir, encoding: "utf8" });
      if (r.status !== 0) throw new Error("npm install failed:\n" + r.stderr);
      writeFileSync(done, new Date().toISOString());
    } finally {
      rmSync(lock, { recursive: true, force: true });
    }
  }
  return dir;
}

/* Merged stdout+stderr in write order: run through a shell with 2>&1. */
function runMerged(command, cwd) {
  const r = spawnSync("sh", ["-c", command + " 2>&1"], {
    cwd,
    encoding: "utf8",
    timeout: 60000,
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

export function checkNode(lessons, { log = console.log, only = null, root = null } = {}) {
  const deps = ensureDeps(lessons, log, root);
  const bin = join(deps, "node_modules", ".bin");
  const results = [];
  const work = mkdtempSync(join(tmpdir(), "zudo-learn-run-"));

  for (const lesson of lessons) {
    if (only && !only.includes(lesson.slug)) continue;
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
        const got = applyMasks(normalize(r.text), ex.mask);
        const want = ex.expected ? applyMasks(normalize(ex.expected), ex.mask) : null;
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
      const got = applyMasks(normalize(r.text), ex.mask);
      const want = applyMasks(normalize(ex.expected), ex.mask);
      const ok = got === want;
      results.push({ label, ok, detail: ok ? "" : diff(want, got) });
    });
  }

  rmSync(work, { recursive: true, force: true });
  return results;
}

