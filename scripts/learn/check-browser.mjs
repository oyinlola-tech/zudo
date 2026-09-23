/**
 * Opens every lesson page in headless Chromium, presses each example's
 * "Run in browser" button (through window.ZudoLearn.run, the same path the
 * click takes) and compares the terminal output with the output shown on
 * the page. Also fails on any uncaught page error.
 */

import { spawn } from "node:child_process";
import { join } from "node:path";

import { launchBrowser } from "./cdp.mjs";
import { applyMasks, normalize } from "./check-node.mjs";
import { checkQuizBrowser } from "./check-quiz.mjs";
import { extractExamples } from "./source.mjs";

async function startServer(root) {
  const port = 8200 + Math.floor(Math.random() * 600);
  const proc = spawn(process.execPath, [join(root, "site", "serve.mjs"), String(port)], { stdio: "ignore" });
  const until = Date.now() + 10000;
  for (;;) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/learn`);
      if (r.status < 500) break;
    } catch {
      /* not up yet */
    }
    if (Date.now() > until) throw new Error("site/serve.mjs did not start");
    await new Promise((r) => setTimeout(r, 100));
  }
  return { url: `http://127.0.0.1:${port}`, stop: () => proc.kill() };
}

export async function checkBrowser(root, lessons, { log = console.log, only = null, quizzes = null, examples = true } = {}) {
  const server = await startServer(root);
  const browser = await launchBrowser();
  const results = [];
  try {
    for (const lesson of examples ? lessons : []) {
      if (only && !only.includes(lesson.slug)) continue;
      browser.consoleErrors.length = 0;
      await browser.goto(`${server.url}/learn/${lesson.slug}`);
      await browser.evaluate(
        `new Promise(r => (window.ZudoLearn && window.ZudoPlayground && window.ZudoPlayground.exec) ? r() : document.addEventListener('zudo:playground-ready', () => setTimeout(r, 0)))`,
      );
      const examples = extractExamples(lesson);
      for (let i = 0; i < examples.length; i++) {
        const ex = examples[i];
        if (ex.tag === "file" || !ex.browser || ex.expected === null || ex.outputKind === "tsc" || ex.check === "skip") continue;
        const label = `${lesson.slug} #${i} ${ex.file}`;
        const lines = await browser.evaluate(`ZudoLearn.run(${i})`);
        const got = applyMasks(normalize(lines.filter((l) => l.kind !== "stack").map((l) => l.text).join("\n")), ex.mask);
        const want = applyMasks(normalize(ex.expected), ex.mask);
        results.push({ label, ok: got === want, detail: got === want ? "" : `  want:\n${want}\n  got:\n${got}` });
      }
      if (browser.consoleErrors.length) {
        results.push({ label: `${lesson.slug} page errors`, ok: false, detail: browser.consoleErrors.join("\n") });
      }
    }
    if (quizzes && quizzes.size) {
      browser.consoleErrors.length = 0;
      results.push(...(await checkQuizBrowser(quizzes, browser, server.url)));
      if (browser.consoleErrors.length) results.push({ label: "test pages: page errors", ok: false, detail: browser.consoleErrors.join("\n") });
    }
  } finally {
    await browser.close();
    server.stop();
  }
  return results;
}
