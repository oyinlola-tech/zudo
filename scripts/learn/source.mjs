/**
 * Reads the Learn course: site-src/learn/course.json plus one source file per
 * lesson, and turns each lesson's custom tags into page HTML.
 *
 * Lesson source = front matter + HTML with these extra tags:
 *   <example file="a.ts" project="p" browser="no" check="skip|tsc-error">code</example>
 *   <example file="app.js" runtime="dom" project="p">…</example>  (browser only: runs against a
 *                                                            preview frame built from the project's
 *                                                            .html/.css <file>s; Node skips it)
 *   <output [kind="tsc"] [mask="ms,iso"]>what it prints</output>  (right after an example;
 *                                                            mask: parts that differ per run,
 *                                                            see MASKS in check-node.mjs)
 *   <file name="package.json" project="p">contents</file>  (shown, not run)
 *   <shell title="…">$ command\noutput</shell>              (run on your computer)
 *   <note>, <tip>, <warn>                                    (callouts)
 *   <exercise title="…"> … <solution> … </solution></exercise>
 *   <reason title="…"> questions to think through … <answer> the reasoning </answer></reason>
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

/** The playground's own highlighter, so lesson code looks like the terminal. */
export function loadHighlighter(root) {
  const src = readFileSync(join(root, "site", "js", "playground.js"), "utf8");
  const body = src.slice(src.indexOf("/* highlight:start */"), src.indexOf("/* highlight:end */"));
  if (!body) throw new Error("highlight markers missing from playground.js");
  return new Function(body + "\nreturn highlight;")();
}

function dedent(raw) {
  const text = raw.replace(/^\n+/, "").replace(/\s+$/, "");
  const lines = text.split("\n");
  const indents = lines.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length);
  const cut = indents.length ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(cut)).join("\n");
}

function attrs(s) {
  const out = {};
  for (const m of (s || "").matchAll(/([\w-]+)="([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}

export function readCourse(root) {
  const dir = join(root, "site-src", "learn");
  const course = JSON.parse(readFileSync(join(dir, "course.json"), "utf8"));
  const lessons = [];
  const courseIds = new Set(course.courses.map((c) => c.id));
  let n = 0;
  for (const c of course.courses) {
    const track = course.tracks.find((t) => t.courses.includes(c.id));
    if (!track) throw new Error(`course ${c.id} is in no track`);
    c.track = track;
    c.lessons = [];
    for (const [mi, mod] of c.modules.entries()) {
      mod.index = mi;
      for (const slug of mod.lessons) {
        if (courseIds.has(slug)) throw new Error(`lesson slug "${slug}" is also a course id`);
        /* A lesson listed in course.json but not written yet is left out. */
        if (!existsSync(join(dir, slug + ".html"))) continue;
        n++;
        const raw = readFileSync(join(dir, slug + ".html"), "utf8");
        const fm = raw.match(/^---\n([\s\S]*?)\n---\n/);
        if (!fm) throw new Error(`${slug}.html has no front matter`);
        const meta = {};
        for (const line of fm[1].split("\n")) {
          const i = line.indexOf(":");
          if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
        }
        const tier = meta.tier || c.tier || "foundation";
        if (course.tiers && !course.tiers[tier]) throw new Error(`${slug}.html: unknown tier "${tier}"`);
        const lesson = {
          slug, order: n, number: c.lessons.length + 1, course: c, module: mod, track,
          tier, meta, body: raw.slice(fm[0].length),
        };
        c.lessons.push(lesson);
        lessons.push(lesson);
      }
    }
  }
  return { course, lessons };
}

/** Pulls every runnable example (with its expected output) out of a lesson, in page order. */
export function extractExamples(lesson) {
  const out = [];
  const re = /<(example|file)\b([^>]*)>([\s\S]*?)<\/\1>(\s*<output\b([^>]*)>([\s\S]*?)<\/output>)?/g;
  for (const m of lesson.body.matchAll(re)) {
    const a = attrs(m[2]);
    out.push({
      tag: m[1],
      file: a.file || a.name,
      project: a.project || null,
      browser: a.browser !== "no",
      runtime: a.runtime || "node",
      check: a.check || null,
      code: dedent(m[3]),
      expected: m[4] ? dedent(m[6]) : null,
      outputKind: m[4] ? attrs(m[5]).kind || "run" : null,
      mask: m[4] ? attrs(m[5]).mask || null : null,
    });
  }
  return out;
}

function runLabel(file) {
  return /\.(m?js)$/.test(file) ? "node " + file : "npx tsx " + file;
}

function renderExample(ex, highlight, index) {
  const src = ex.code.replace(/<\/(script)/gi, "<\\/$1");
  const isFile = ex.tag === "file";
  const runnable = !isFile && ex.browser;
  const dom = ex.runtime === "dom";
  const lang = /\.(json|html|css)$/.test(ex.file) ? "plain" : /\.(m?js)$/.test(ex.file) ? "js" : "ts";
  const code = lang === "plain" ? escapeHtml(ex.code) + "\n" : highlight(ex.code);
  const action = isFile
    ? ""
    : runnable
      ? `<button type="button" class="lx-run" data-index="${index}"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 4l14 8-14 8z"/></svg>Run in browser</button>`
      : `<span class="lx-nodeonly" title="This example uses Node.js, so run it on your computer">Node.js only</span>`;
  let html =
    `<figure class="lx-example" data-index="${index}" data-file="${escapeAttr(ex.file)}"` +
    (ex.project ? ` data-project="${escapeAttr(ex.project)}"` : "") +
    (dom ? ` data-runtime="dom"` : "") +
    `>\n<figcaption class="lx-bar"><span class="lx-file">${escapeHtml(ex.file)}</span>` +
    (dom ? "" : `<button type="button" class="lx-edit" data-index="${index}" title="Open in the editor: change it, save it in this browser and run it">Edit</button>`) +
    `${action}</figcaption>\n` +
    `<pre class="lx-code"><code>${code}</code></pre>\n` +
    `<script type="text/plain" class="lx-src">${src}</script>\n`;
  if (ex.expected !== null) {
    const label =
      ex.outputKind === "tsc"
        ? `What <code>npx tsc --noEmit</code> prints`
        : dom
          ? `What the browser terminal prints`
          : `Output of <code>${escapeHtml(runLabel(ex.file))}</code>${runnable ? " and of the browser terminal" : ""}`;
    html +=
      `<div class="lx-out${ex.outputKind === "tsc" ? " lx-out-tsc" : ""}"><div class="lx-out-label">${label}</div>` +
      `<pre class="lx-no-copy">${escapeHtml(ex.expected)}</pre></div>\n`;
  }
  return html + `</figure>`;
}

/* <shell> holds plain terminal text, but authors also write it as HTML
   (&lt;, &amp;); decode those first so both spellings render the same. */
function decodeEntities(s) {
  return s.replace(/&(lt|gt|quot|#39|amp);/g, (m, e) => ({ lt: "<", gt: ">", quot: '"', "#39": "'", amp: "&" })[e]);
}

function renderShell(a, raw) {
  const text = decodeEntities(dedent(raw));
  const commands = [];
  const body = text
    .split("\n")
    .map((line) => {
      if (line.startsWith("$ ")) {
        commands.push(line.slice(2));
        return `<span class="lx-cmd"><span class="lx-prompt" aria-hidden="true">$ </span>${escapeHtml(line.slice(2))}</span>`;
      }
      if (line.startsWith("# ")) return `<span class="lx-cmt">${escapeHtml(line)}</span>`;
      return `<span class="lx-res">${escapeHtml(line)}</span>`;
    })
    .join("\n");
  const title = a.title || "Terminal on your computer";
  return (
    `<figure class="lx-shell"><figcaption class="lx-bar"><span class="lx-file">${escapeHtml(title)}</span></figcaption>\n` +
    `<pre class="lx-shell-body" data-copy="${escapeAttr(commands.join("\n"))}">${body}</pre></figure>`
  );
}

/* Titles are lesson HTML (entities already written as &quot; etc.), so they are inserted as-is. */
const CALLOUTS = { note: ["callout-note", "NOTE"], tip: ["callout-tip", "TIP"], warn: ["callout-warning", "WATCH OUT"] };

/** Lesson source → the HTML that goes inside <main>. */
export function renderBody(lesson, highlight) {
  let index = 0;
  let html = lesson.body.replace(
    /<(example|file)\b([^>]*)>([\s\S]*?)<\/\1>(\s*<output\b([^>]*)>([\s\S]*?)<\/output>)?/g,
    (m, tag, a, code, hasOut, outAttrs, expected) => {
      const at = attrs(a);
      const ex = {
        tag,
        file: at.file || at.name,
        project: at.project || null,
        browser: at.browser !== "no",
        runtime: at.runtime || "node",
        code: dedent(code),
        expected: hasOut ? dedent(expected) : null,
        outputKind: hasOut ? attrs(outAttrs).kind || "run" : null,
      };
      return renderExample(ex, highlight, index++);
    },
  );
  html = html.replace(/<shell\b([^>]*)>([\s\S]*?)<\/shell>/g, (m, a, raw) => renderShell(attrs(a), raw));
  for (const [tag, [cls, label]] of Object.entries(CALLOUTS)) {
    html = html.replace(
      new RegExp(`<${tag}(?:\\s+title="([^"]*)")?>([\\s\\S]*?)</${tag}>`, "g"),
      (m, title, inner) => `<div class="callout ${cls}"><p class="lx-callout-label">${title || label}</p>${inner.trim()}</div>`,
    );
  }
  html = html.replace(/<exercise\s+title="([^"]*)">([\s\S]*?)<\/exercise>/g, (m, title, inner) => {
    const [task, solution] = inner.split(/<solution>/);
    return (
      `<div class="lx-exercise"><p class="lx-exercise-label">TRY IT YOURSELF</p><h3>${title}</h3>${task.trim()}` +
      (solution ? `<details class="lx-solution"><summary>Show a solution</summary>${solution.replace(/<\/solution>/, "").trim()}</details>` : "") +
      `</div>`
    );
  });
  html = html.replace(/<reason\s+title="([^"]*)">([\s\S]*?)<\/reason>/g, (m, title, inner) => {
    const [task, answer] = inner.split(/<answer>/);
    return (
      `<div class="lx-reason"><p class="lx-reason-label">REASON IT OUT</p><h3>${title}</h3>${task.trim()}` +
      (answer ? `<details class="lx-solution"><summary>Show the reasoning</summary>${answer.replace(/<\/answer>/, "").trim()}</details>` : "") +
      `</div>`
    );
  });
  return html;
}

/** h2 elements with ids, for the "On this page" list. */
export function headings(lesson) {
  return [...lesson.body.matchAll(/<h2 id="([^"]+)">([\s\S]*?)<\/h2>/g)].map((m) => ({ id: m[1], text: m[2].replace(/<[^>]+>/g, "") }));
}
