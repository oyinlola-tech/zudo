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
/*
 * Node examples run in UTC and the browser checker (cdp.mjs) in Africa/Lagos (UTC+1), whatever
 * the machine's zone is. An output that depends on the local time zone then can't
 * match in both, so it fails instead of showing learners elsewhere the wrong thing.
 */
export const CHECK_TZ = "UTC";

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

function dedentText(text) {
  const lines = text.split("\n");
  const indents = lines.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length);
  const cut = indents.length ? Math.min(...indents) : 0;
  return cut ? lines.map((l) => l.slice(cut)).join("\n") : text;
}

export function normalize(text) {
  return text
    .replace(ANSI, "")
    /* Paths into the shared dependency cache read as the learner's own node_modules. */
    .replace(/(?:(?:\.\.\/)+|\/\S*?\/)zudo-learn-deps-[0-9a-f]+\/node_modules\//g, "node_modules/")
    /* The checker's temporary project folder reads as a learner's project folder. */
    .replace(/(?:file:\/\/)?\/\S*?zudo-learn-run-\w+\/[\w.-]+\/[\w.-]+\//g, "/home/you/project/")
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .join("\n")
    .replace(/\n+$/, "")
    .replace(/^\n+/, "")
    /* Lesson <output>s are dedented when read, so compare both sides dedented. */
    .replace(/^/, "\u0000")
    .replace(/[\s\S]*/, (t) => dedentText(t.slice(1)));
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
      writeFileSync(join(lock, "pid"), String(process.pid));
    } catch {
      /* Another check is installing: wait for it. The lock is stale only when the
         process that holds it has died (an install can take well over 10 minutes). */
      if (lockIsStale(lock)) rmSync(lock, { recursive: true, force: true });
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

/*
 * <file check="emit">: compile the project with emit on (into a scratch folder, so the
 * project's own files stay as the lesson shows them) and compare the emitted file.
 */
function checkEmit(ex, dir, bin, label) {
  const out = mkdtempSync(join(tmpdir(), "zudo-learn-emit-"));
  try {
    const decl = /\.d\.ts$/.test(ex.file) ? " --declaration" : "";
    const root = ex.file.split("/")[0];
    const r = runMerged(`${join(bin, "tsc")} -p . --noEmit false --outDir ${out} --rootDir .${decl} ${ex.tscFlags}`, dir);
    if (r.status !== 0) return { label, ok: false, detail: "tsc failed:\n" + normalize(r.text) };
    const rel = ex.file.slice(root.length + 1);
    const emitted = join(out, rel);
    if (!existsSync(emitted)) return { label, ok: false, detail: `tsc did not emit ${rel} (the path after "${root}/" must match the source file)` };
    const want = normalize(ex.code);
    const got = normalize(readFileSync(emitted, "utf8"));
    return { label, ok: want === got, detail: want === got ? "" : diff(want, got), emitted: got };
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

function lockIsStale(lock) {
  try {
    const pid = Number(readFileSync(join(lock, "pid"), "utf8"));
    process.kill(pid, 0);
    return false;
  } catch (e) {
    if (e.code === "EPERM") return false;
    /* No pid file yet: the holder is between mkdir and write, unless that was long ago. */
    if (e.code === "ENOENT") {
      try {
        return Date.now() - statSync(lock).mtimeMs > 60000;
      } catch {
        return false;
      }
    }
    return true;
  }
}

/* Merged stdout+stderr in write order: run through a shell with 2>&1. */
function runMerged(command, cwd) {
  const r = spawnSync("sh", ["-c", command + " 2>&1"], {
    cwd,
    encoding: "utf8",
    timeout: 60000,
    env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0", NODE_NO_WARNINGS: "1", TZ: CHECK_TZ },
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

/*
 * fill: pass an array and every example whose <output> is empty gets its real
 * output pushed as { slug, index, text } (site-learn.mjs --fill writes it back).
 */
export function checkNode(lessons, { log = console.log, only = null, root = null, fill = null } = {}) {
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
      /* node_modules is a symlink to the shared dependency cache: never write into it. */
      if (/(^|\/)node_modules(\/|$)|(^|\/)\.\.(\/|$)|^\//.test(ex.file)) {
        results.push({ label: `${lesson.slug} #${i} ${ex.file}`, ok: false, detail: "file names may not start with /, contain .. or point into node_modules" });
        return;
      }
      const dir = projectDir(ex, i);
      const target = join(dir, ex.file);
      mkdirSync(dirname(target), { recursive: true });
      /* A tsc-error example may reuse the name of an earlier file: put that file back afterwards. */
      const before = ex.check === "tsc-error" && existsSync(target) ? readFileSync(target, "utf8") : null;
      writeFileSync(target, ex.code + "\n");
      if (ex.tag === "file" && ex.check === "emit") {
        const r = checkEmit(ex, dir, bin, `${lesson.slug} #${i} ${ex.file} (emit)`);
        if (fill && !ex.code.trim() && r.emitted !== undefined) fill.push({ slug: lesson.slug, index: i, text: r.emitted, body: true });
        results.push(r);
        return;
      }
      if (ex.tag === "file" || ex.check === "skip" || ex.runtime === "dom") return;
      const isTs = /\.(ts|mts|cts)$/.test(ex.file);
      const label = `${lesson.slug} #${i} ${ex.file}`;

      if (ex.check === "tsc-error") {
        const r = runMerged(`${join(bin, "tsc")} --noEmit --pretty`, dir);
        if (fill && ex.expected === "") {
          if (r.status !== 0) fill.push({ slug: lesson.slug, index: i, text: normalize(r.text) });
          else log(`--fill: ${lesson.slug} #${i} ${ex.file} is check="tsc-error" but tsc passes, so there is nothing to fill`);
        }
        const got = applyMasks(normalize(r.text), ex.mask);
        /* No <output> at all: only "tsc fails" is checked. An empty <output> is compared like any other. */
        const want = ex.expected !== null ? applyMasks(normalize(ex.expected), ex.mask) : null;
        const ok = r.status !== 0 && (want === null || want === got);
        results.push({ label, ok, detail: ok ? "" : r.status === 0 ? "expected a type error, tsc passed" : diff(want, got) });
        if (before !== null) writeFileSync(target, before);
        else rmSync(target);
        return;
      }

      if (isTs) {
        const t = runMerged(`${join(bin, "tsc")} --noEmit --pretty`, dir);
        if (t.status !== 0) {
          if (fill && ex.expected === "") log(`--fill: ${label} not filled, the project does not type-check:\n${normalize(t.text)}`);
          results.push({ label: label + " (tsc)", ok: false, detail: normalize(t.text) });
          return;
        }
      }

      if (ex.expected === null) return;
      const cmd = isTs ? `${join(bin, "tsx")} ${ex.file}` : `node ${ex.file}`;
      const r = runMerged(cmd, dir);
      if (fill && ex.expected === "") {
        fill.push({ slug: lesson.slug, index: i, text: normalize(r.text) });
        if (r.status !== 0) log(`--fill: ${label} exited with code ${r.status}; its output (filled in anyway) is:\n${normalize(r.text).split("\n").slice(0, 6).join("\n")}`);
      }
      const got = applyMasks(normalize(r.text), ex.mask);
      const want = applyMasks(normalize(ex.expected), ex.mask);
      const ok = got === want;
      results.push({ label, ok, detail: ok ? "" : diff(want, got) });
    });
  }

  rmSync(work, { recursive: true, force: true });
  return results;
}

