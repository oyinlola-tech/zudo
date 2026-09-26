/**
 * Checks the "Try it yourself" exercises (see scripts/learn/exercise.mjs):
 *
 *  - every exercise has a hint, and a starter when it can be checked;
 *  - every JavaScript or TypeScript starter parses (the learner never starts
 *    from a syntax error).
 *
 * The browser part (check-browser.mjs) runs each "run" exercise the way the
 * editor's Check does: the starter must not pass, the solution must.
 */

import { createRequire } from "node:module";
import { join } from "node:path";

import { ensureDeps } from "./check-node.mjs";
import { exerciseProblems, lessonExercises } from "./exercise.mjs";

export function checkExercises(lessons, { only = null, root, log = console.log }) {
  const results = [];
  const deps = ensureDeps(lessons, log, root);
  const esbuild = createRequire(join(deps, "node_modules", "x.js"))("esbuild");
  for (const lesson of lessons) {
    if (only && !only.includes(lesson.slug)) continue;
    for (const p of exerciseProblems(lesson.slug, lesson.body)) results.push({ label: `${lesson.slug} exercises`, ok: false, detail: p });
    for (const ex of lessonExercises(lesson.body)) {
      const target = ex.blocks[ex.target];
      for (const s of ex.starters) {
        const file = s.file || (target && target.file) || "";
        if (!/\.(m?[jt]s|cts|cjs)$/.test(file)) continue;
        const label = `${lesson.slug} exercise ${ex.number} starter ${file}`;
        try {
          esbuild.transformSync(s.raw.replace(/^\n+/, ""), { loader: /\.[mc]?ts$/.test(file) ? "ts" : "js", format: "esm" });
          results.push({ label, ok: true });
        } catch (e) {
          results.push({ label, ok: false, detail: "the starter does not parse: " + ((e.errors && e.errors[0] && e.errors[0].text) || e.message) });
        }
      }
    }
  }
  return results;
}
