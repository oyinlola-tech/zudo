/**
 * The theme block every page carries in <head>: the boot part of
 * site/js/theme.js inlined (so the first paint is already themed) and the
 * deferred script tag for the rest. Owned between `<!-- theme:start -->` and
 * `<!-- theme:end -->`, so it can be rebuilt on every run.
 *
 * Used by scripts/site-seo.mjs (every page) and scripts/learn/page.mjs (the
 * Academy templates), so the two cannot drift from the source file.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SOURCE = fileURLToPath(new URL("../site/js/theme.js", import.meta.url));
const OLD_BLOCK = /^[ \t]*<!-- theme:start -->[\s\S]*?<!-- theme:end -->[ \t]*\r?\n/m;

/** The boot IIFE from theme.js, comments and line breaks removed. */
export function themeBoot() {
  const src = readFileSync(SOURCE, "utf8");
  const m = src.match(/\/\* boot:start \*\/\s*([\s\S]*?)\s*\/\* boot:end \*\//);
  if (!m) throw new Error("boot:start / boot:end marks missing from site/js/theme.js");
  return m[1]
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s*\n\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function themeBlock() {
  return [
    `  <!-- theme:start -->`,
    `  <script>${themeBoot()}</script>`,
    `  <script src="/js/theme.js" defer></script>`,
    `  <!-- theme:end -->`,
  ].join("\n");
}

/**
 * Returns `head` with the current theme block in place: after the theme-color
 * meta, else after the viewport meta, else right after <head>. A head with
 * none of those is returned untouched.
 */
export function withThemeBlock(head) {
  const clean = head.replace(OLD_BLOCK, "");
  const anchors = [
    /(<meta\s+name="theme-color"[^>]*>[ \t]*\r?\n)/i,
    /(<meta\s+name="viewport"[^>]*>[ \t]*\r?\n)/i,
    /(<head>[ \t]*\r?\n)/i,
  ];
  for (const re of anchors) {
    if (re.test(clean)) return clean.replace(re, `$1${themeBlock()}\n`);
  }
  return clean;
}
