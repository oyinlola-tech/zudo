/**
 * "Try it yourself" exercises.
 *
 *   <exercise title="…">
 *     <p>the task</p>
 *     <starter file="retry.js">code the learner starts from</starter>   (one per file they write)
 *     <hint>a nudge that does not give the answer away</hint>           (one or more, in order)
 *     <solution> … <example file="retry.js">…</example><output>…</output> … </solution>
 *   </exercise>
 *
 * How an exercise is checked depends on its solution (see exerciseMode):
 *   run    the last solution example with an output runs in the browser: the editor's Check
 *          runs the learner's code and compares what it prints with that output;
 *   paste  that example is Node.js only (or its output is from tsc): the learner runs it on
 *          their computer and pastes what it printed into the editor, which compares it;
 *   open   the solution has code but no output to compare: the editor opens, nothing is checked;
 *   think  the solution has no code: a written answer.
 * Hints unlock one at a time after failed checks, the solution after a pass or a few misses
 * (site/js/exercise.js). In think and open mode they unlock without a check.
 */

import { escapeAttr } from "./source.mjs";

const TAG_RE = /<(example|file)\b([^>]*)>[\s\S]*?<\/\1>(\s*<output\b([^>]*)>[\s\S]*?<\/output>)?/g;
const STARTER_RE = /<starter\b([^>]*)>([\s\S]*?)<\/starter>/g;
const HINT_RE = /<hint>([\s\S]*?)<\/hint>/g;

function attrs(s) {
  const out = {};
  for (const m of (s || "").matchAll(/([\w-]+)="([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}

function runLabel(file) {
  return /\.(m?js)$/.test(file) ? "node " + file : "npx tsx " + file;
}

/**
 * The code blocks of a solution in order (examples and files alike, since both render as a
 * figure) and which one the exercise is checked against.
 */
export function exerciseMode(solution) {
  const blocks = [...(solution || "").matchAll(TAG_RE)].map((m) => {
    const a = attrs(m[2]);
    return {
      tag: m[1],
      file: a.file || a.name,
      project: a.project || null,
      browser: a.browser !== "no",
      dom: a.runtime === "dom",
      hasOutput: !!m[3],
      kind: m[3] ? attrs(m[4]).kind || "run" : null,
    };
  });
  if (!blocks.length) return { mode: "think", blocks };
  let target = -1;
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (blocks[i].tag === "example" && blocks[i].hasOutput) { target = i; break; }
  }
  if (target === -1) return { mode: "open", blocks, target: blocks.findIndex((b) => b.tag === "example") };
  const t = blocks[target];
  if (t.kind === "tsc") return { mode: "paste", blocks, target, command: "npx tsc --noEmit" };
  if (!t.browser) return { mode: "paste", blocks, target, command: runLabel(t.file) };
  return { mode: "run", blocks, target, dom: t.dom };
}

/** Splits an exercise's source into its parts. */
export function parseExercise(inner) {
  const at = inner.indexOf("<solution>");
  const head = at === -1 ? inner : inner.slice(0, at);
  const solution = at === -1 ? "" : inner.slice(at + "<solution>".length).replace(/<\/solution>\s*$/, "");
  const starters = [...head.matchAll(STARTER_RE)].map((m) => {
    const a = attrs(m[1]);
    return { file: a.file || null, raw: m[2], stash: a["data-i"] };
  });
  const hints = [...head.matchAll(HINT_RE)].map((m) => m[1].trim());
  const task = head.replace(STARTER_RE, "").replace(HINT_RE, "").trim();
  return { task, starters, hints, solution: solution.trim(), ...exerciseMode(solution) };
}

/** Every exercise of a lesson source, in page order. */
export function lessonExercises(body) {
  return [...body.matchAll(/<exercise\s+title="([^"]*)">([\s\S]*?)<\/exercise>/g)].map((m, i) => ({
    number: i + 1,
    title: m[1],
    ...parseExercise(m[2]),
  }));
}

const MODE_NOTE = {
  run: "Write it in the editor, then press <strong>Check</strong>. Hints and the solution open up once you have checked your code.",
  paste: "Write it in the editor, run it on your computer, then press <strong>Check</strong> and paste what it printed. Hints and the solution open up once you have checked your output.",
  open: "Write it in the editor and run it. Hints and the solution open up once you have tried.",
  think: "Work it out first, on paper or in your head. Then use the hints, and compare with the solution.",
};

/**
 * The card for one exercise. `starterCode` maps a starter's position to its (unescaped) code;
 * `solutionHtml` is the solution after examples were rendered.
 */
export function renderExercise(number, title, ex, starterCode, solutionHtml) {
  const target = ex.blocks[ex.target];
  const data =
    ` data-exercise="${number}" data-mode="${ex.mode}"` +
    (ex.target >= 0 && ex.target !== undefined ? ` data-target="${ex.target}"` : "") +
    (target ? ` data-file="${escapeAttr(target.file)}"` : "") +
    (target && target.project ? ` data-project="${escapeAttr(target.project)}"` : "") +
    (ex.dom ? ` data-runtime="dom"` : "") +
    (ex.command ? ` data-command="${escapeAttr(ex.command)}"` : "");
  const starters = ex.starters
    .map((s, i) => {
      const file = s.file || (target && target.file) || "exercise.js";
      const code = starterCode[i].replace(/<\/(script)/gi, "<\\/$1");
      return `<script type="text/plain" class="lx-ex-starter" data-file="${escapeAttr(file)}">${code}</script>`;
    })
    .join("");
  const hints = ex.hints
    .map((h, i) => `<div class="lx-ex-hint" hidden><p class="lx-ex-hint-label">HINT ${i + 1}</p>${h}</div>`)
    .join("");
  const tryButton =
    ex.mode === "think"
      ? ""
      : `<button type="button" class="lx-ex-try"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 4l14 8-14 8z"/></svg>Try it in the editor</button>`;
  return (
    `<div class="lx-exercise"${data} data-title="${title}"><p class="lx-exercise-label">TRY IT YOURSELF</p><h3>${title}</h3><div class="lx-ex-task">${ex.task}</div>` +
    starters +
    `<p class="lx-ex-how">${MODE_NOTE[ex.mode]}</p>` +
    `<div class="lx-ex-bar">${tryButton}<span class="lx-ex-status" aria-live="polite"></span></div>` +
    `<div class="lx-ex-hints">${hints}</div>` +
    `<div class="lx-ex-unlocks">` +
    (ex.hints.length ? `<button type="button" class="lx-ex-more" disabled>Show a hint</button>` : "") +
    (solutionHtml ? `<button type="button" class="lx-ex-reveal" disabled>Show the solution</button>` : "") +
    `</div>` +
    (solutionHtml ? `<div class="lx-ex-solution" hidden><p class="lx-ex-hint-label">SOLUTION</p>${solutionHtml}</div>` : "") +
    `</div>`
  );
}

/** Authoring problems in a lesson's exercises, as strings. */
export function exerciseProblems(slug, body, { requireHints = true } = {}) {
  const problems = [];
  for (const ex of lessonExercises(body)) {
    const where = `${slug} exercise ${ex.number} "${ex.title}"`;
    if (requireHints && !ex.hints.length) problems.push(`${where}: no <hint>`);
    if ((ex.mode === "run" || ex.mode === "paste") && !ex.starters.length) problems.push(`${where}: no <starter> (${ex.mode} mode)`);
    const files = new Set(ex.blocks.map((b) => b.file));
    for (const s of ex.starters) {
      if (s.file && !files.has(s.file)) problems.push(`${where}: <starter file="${s.file}"> matches no file in the solution`);
    }
    if (ex.starters.filter((s) => !s.file).length > 1) problems.push(`${where}: more than one <starter> without file=`);
  }
  return problems;
}
