/**
 * Checks the lesson tests (site-src/learn/quiz/<slug>.html):
 *
 *  - shape: 30 to 50 questions, unique ids, one correct option, …
 *  - "output" questions: the correct option is what the code really prints
 *    (in Node, and in the browser terminal unless the code is Node-only);
 *  - "code" questions: the solution prints exactly <expected> in Node and in
 *    the browser terminal, and the starter does not already pass;
 *  - every .ts file in a test passes `tsc --noEmit`.
 */

import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { DEFAULT_TSCONFIG, ensureDeps, normalize } from "./check-node.mjs";
import { plainText, validateQuiz } from "./quiz.mjs";

const CONCURRENCY = 6;

function runAsync(cmd, args, cwd, timeoutMs = 20000) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd,
      env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0", NODE_NO_WARNINGS: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let text = "";
    child.stdout.on("data", (d) => (text += d));
    child.stderr.on("data", (d) => (text += d));
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("close", (status) => {
      clearTimeout(timer);
      resolve({ status, text });
    });
  });
}

async function pool(items, worker) {
  let next = 0;
  const lanes = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (next < items.length) await worker(items[next++]);
  });
  await Promise.all(lanes);
}

/* Everything a test runs: [{ slug, q, role: "code"|"solution"|"starter", file, src, want }] */
function jobs(quiz) {
  const out = [];
  for (const q of quiz.questions) {
    if (q.type === "output") {
      const right = q.options.find((o) => o.correct);
      out.push({ q, role: "code", file: q.file, src: q.code, want: right ? plainText(right.html) : "" });
    }
    if (q.type === "code") {
      out.push({ q, role: "solution", file: q.file, src: q.solution, want: q.expected });
      out.push({ q, role: "starter", file: q.file, src: q.starter, want: q.expected });
    }
  }
  return out;
}

export async function checkQuizNode(quizzes, { lessons, root, log = console.log }) {
  const results = [];
  for (const [slug, quiz] of quizzes) {
    for (const p of validateQuiz(quiz)) results.push({ label: `${slug} test`, ok: false, detail: p });
  }
  const deps = ensureDeps(lessons, log, root);
  const bin = join(deps, "node_modules", ".bin");
  const work = mkdtempSync(join(tmpdir(), "zudo-quiz-run-"));
  const all = [];

  for (const [slug, quiz] of quizzes) {
    const dir = join(work, slug);
    mkdirSync(dir, { recursive: true });
    symlinkSync(join(deps, "node_modules"), join(dir, "node_modules"), "dir");
    writeFileSync(join(dir, "package.json"), JSON.stringify({ type: "module" }));
    const tsconfig = structuredClone(DEFAULT_TSCONFIG);
    tsconfig.compilerOptions.moduleDetection = "force";
    writeFileSync(join(dir, "tsconfig.json"), JSON.stringify(tsconfig));
    let hasTs = false;
    for (const job of jobs(quiz)) {
      /* One folder per question and role, so files never clash. */
      const rel = join(job.q.id, job.role, job.file);
      mkdirSync(dirname(join(dir, rel)), { recursive: true });
      writeFileSync(join(dir, rel), job.src + "\n");
      /* The starter is unfinished on purpose, so it is not type-checked. */
      if (/\.ts$/.test(job.file) && job.role !== "starter") hasTs = true;
      else if (/\.ts$/.test(job.file)) writeFileSync(join(dir, rel), "// @ts-nocheck\n" + job.src + "\n");
      all.push({ ...job, slug, dir, rel });
    }
    if (hasTs) {
      const t = spawnSync(join(bin, "tsc"), ["--noEmit", "--pretty", "false"], { cwd: dir, encoding: "utf8" });
      if (t.status !== 0) results.push({ label: `${slug} test (tsc)`, ok: false, detail: normalize(t.stdout + t.stderr) });
    }
  }

  await pool(all, async (job) => {
    const isTs = /\.ts$/.test(job.file);
    /* Starters keep their line numbers: the @ts-nocheck line is removed again for running. */
    if (job.role === "starter" && isTs) writeFileSync(join(job.dir, job.rel), job.src + "\n");
    const r = await runAsync(isTs ? join(bin, "tsx") : process.execPath, [job.rel], job.dir);
    const got = normalize(r.text);
    const want = normalize(job.want);
    const label = `${job.slug} test ${job.q.id} (${job.role})`;
    if (job.role === "starter") {
      results.push({ label, ok: got !== want, detail: "the starter code already prints the expected output" });
    } else {
      results.push({ label, ok: got === want, detail: got === want ? "" : `  want:\n${want}\n  got:\n${got}` });
    }
  });

  rmSync(work, { recursive: true, force: true });
  return results;
}

/** Browser part: run through the page's own terminal, like a learner pressing Run. */
export async function checkQuizBrowser(quizzes, browser, baseUrl) {
  const results = [];
  for (const [slug, quiz] of quizzes) {
    await browser.goto(`${baseUrl}/learn/${slug}`);
    await browser.evaluate(
      `new Promise(r => (window.ZudoPlayground && window.ZudoPlayground.exec) ? r() : document.addEventListener('zudo:playground-ready', () => setTimeout(r, 0)))`,
    );
    for (const job of jobs(quiz)) {
      if (job.role === "starter" || (job.role === "code" && !job.q.browser)) continue;
      const label = `${slug} test ${job.q.id} (${job.role}, browser)`;
      const lines = await browser.evaluate(
        `(ZudoPlayground.registerFiles({}), ZudoPlayground.exec(${JSON.stringify(job.src)}, ${JSON.stringify(job.file)}, { show: false }))`,
      );
      const got = normalize(lines.filter((l) => l.kind !== "stack").map((l) => l.text).join("\n"));
      const want = normalize(job.want);
      results.push({ label, ok: got === want, detail: got === want ? "" : `  want:\n${want}\n  got:\n${got}` });
    }
  }
  return results;
}
