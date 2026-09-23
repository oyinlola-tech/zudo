/**
 * Lesson tests ("Test yourself"). One source file per lesson:
 * site-src/learn/quiz/<slug>.html, a list of <question> blocks.
 *
 *   <question id="unique-id" type="choice">       pick the right answer
 *     <q>Question text (HTML allowed)</q>
 *     <code file="a.js">optional code shown with the question</code>   (file= is required;
 *                                                  a <code> without it is inline text)
 *     <option>wrong</option>
 *     <option correct>right</option>                exactly one correct option
 *     <explain>Why the right answer is right.</explain>
 *   </question>
 *
 *   <question id="…" type="output">                "what does this print?"
 *     <q>…</q>
 *     <code file="a.js" [browser="no"]>code</code>  the checker runs it: the correct
 *     <option>…</option><option correct>…</option>  option must be its real output
 *     <explain>…</explain>
 *   </question>
 *
 *   <question id="…" type="code" file="sum.js">    write code in the terminal
 *     <q>…</q>
 *     <starter>code the learner starts from</starter>
 *     <solution>a working answer</solution>          the checker runs it in Node and
 *     <expected>what a correct answer prints</expected>   in the browser terminal
 *     <explain>…</explain>
 *   </question>
 *
 * Code questions always run in the browser terminal, so they may only use
 * plain JavaScript/TypeScript and the @zudojs packages bundled for it.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const QUIZ_SIZE = 5;
export const QUIZ_PASS = 4;
export const QUIZ_MIN = 30;
export const QUIZ_MAX = 50;

function dedent(raw) {
  const text = raw.replace(/^\n+/, "").replace(/\s+$/, "");
  const lines = text.split("\n");
  const indents = lines.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length);
  const cut = indents.length ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(cut)).join("\n");
}

function attrs(s) {
  const out = {};
  for (const m of (s || "").matchAll(/([\w-]+)(?:="([^"]*)")?/g)) out[m[1]] = m[2] === undefined ? true : m[2];
  return out;
}

function one(body, tag) {
  const m = body.match(new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)</${tag}>`));
  return m ? { attrs: attrs(m[1]), text: m[2] } : null;
}

/** HTML text → plain text (for comparing an option with real output). */
export function plainText(html) {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

export function parseQuiz(source, slug) {
  const questions = [];
  for (const m of source.matchAll(/<question\b([^>]*)>([\s\S]*?)<\/question>/g)) {
    const a = attrs(m[1]);
    const body = m[2];
    const q = one(body, "q");
    /* The question's code block is the <code file="…"> one; plain <code> is inline text. */
    const codeMatch = body.match(/<code\s+(file="[^"]*"[^>]*)>([\s\S]*?)<\/code>/);
    const code = codeMatch ? { attrs: attrs(codeMatch[1]), text: codeMatch[2] } : null;
    const question = {
      id: a.id,
      type: a.type,
      q: q ? q.text.trim() : "",
      explain: (one(body, "explain") || { text: "" }).text.trim(),
    };
    if (code) {
      question.code = dedent(code.text);
      question.file = code.attrs.file || "example.js";
      question.browser = code.attrs.browser !== "no";
    }
    if (a.type === "choice" || a.type === "output") {
      question.options = [...body.matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/g)].map((o) => ({
        html: o[2].trim(),
        correct: attrs(o[1]).correct === true,
      }));
    }
    if (a.type === "code") {
      question.file = a.file || "answer.js";
      question.starter = dedent((one(body, "starter") || { text: "" }).text);
      question.solution = dedent((one(body, "solution") || { text: "" }).text);
      question.expected = dedent((one(body, "expected") || { text: "" }).text);
    }
    questions.push(question);
  }
  return { slug, questions };
}

export function readQuizzes(root, lessons) {
  const out = new Map();
  for (const lesson of lessons) {
    const file = join(root, "site-src", "learn", "quiz", lesson.slug + ".html");
    if (existsSync(file)) out.set(lesson.slug, parseQuiz(readFileSync(file, "utf8"), lesson.slug));
  }
  return out;
}

/** Shape problems, without running anything. */
export function validateQuiz(quiz) {
  const problems = [];
  const ids = new Set();
  const n = quiz.questions.length;
  if (n < QUIZ_MIN || n > QUIZ_MAX) problems.push(`has ${n} questions (need ${QUIZ_MIN} to ${QUIZ_MAX})`);
  for (const [i, q] of quiz.questions.entries()) {
    const at = `question ${i + 1}${q.id ? ` (${q.id})` : ""}`;
    if (!q.id || !/^[a-z0-9-]+$/.test(q.id)) problems.push(`${at}: id must be lower-case letters, digits and dashes`);
    if (ids.has(q.id)) problems.push(`${at}: duplicate id`);
    ids.add(q.id);
    if (!["choice", "output", "code"].includes(q.type)) problems.push(`${at}: type must be choice, output or code`);
    if (!q.q) problems.push(`${at}: missing <q>`);
    if (!q.explain) problems.push(`${at}: missing <explain>`);
    if (q.type === "choice" || q.type === "output") {
      if (q.options.length < 2 || q.options.length > 5) problems.push(`${at}: needs 2 to 5 options`);
      if (q.options.filter((o) => o.correct).length !== 1) problems.push(`${at}: needs exactly one <option correct>`);
      const texts = q.options.map((o) => plainText(o.html).trim());
      if (new Set(texts).size !== texts.length) problems.push(`${at}: two options are the same`);
    }
    if (q.type === "output" && !q.code) problems.push(`${at}: an output question needs <code>`);
    if (q.type === "code") {
      if (!q.solution) problems.push(`${at}: missing <solution>`);
      if (!q.expected) problems.push(`${at}: missing <expected>`);
      if (!q.starter) problems.push(`${at}: missing <starter>`);
      if (!/\.(m?js|ts)$/.test(q.file)) problems.push(`${at}: file must end in .js or .ts`);
    }
  }
  return problems;
}

/** What the page downloads: everything the test needs, nothing it does not. */
export function quizJson(quiz) {
  return {
    size: QUIZ_SIZE,
    pass: QUIZ_PASS,
    questions: quiz.questions.map((q) => {
      const out = { id: q.id, type: q.type, q: q.q, explain: q.explain };
      if (q.code) Object.assign(out, { code: q.code, file: q.file });
      if (q.options) {
        out.options = q.options.map((o) => o.html);
        out.answer = q.options.findIndex((o) => o.correct);
      }
      if (q.type === "code") Object.assign(out, { file: q.file, starter: q.starter, expected: q.expected, solution: q.solution });
      return out;
    }),
  };
}
