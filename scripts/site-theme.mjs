/**
 * The theme block every page carries in <head>: the boot part of
 * site/js/theme.js inlined (so the first paint is already themed) and the
 * deferred script tag for the rest. Owned between `<!-- theme:start -->` and
 * `<!-- theme:end -->`, so it can be rebuilt on every run.
 *
 * Used by scripts/site-seo.mjs (every page) and scripts/learn/page.mjs (the
 * Academy templates), so the two cannot drift from the source file.
 *
 * Run directly (pnpm site:theme) it also rewrites the token table on
 * site/docs/design-themes.html from the two token blocks in css/site.css.
 */
import { readFileSync, writeFileSync } from "node:fs";
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

/* ---------- the token table on /docs/design-themes ---------- */

const CSS = fileURLToPath(new URL("../site/css/site.css", import.meta.url));
const DOC = fileURLToPath(new URL("../site/docs/design-themes.html", import.meta.url));
const SKIP = /^--z-(font|nav|container)/;

function block(css, selector) {
  const start = css.indexOf(selector + " {");
  if (start === -1) throw new Error(`${selector} block missing from site.css`);
  const end = css.indexOf("\n}", start);
  return css.slice(start, end).split("\n").slice(1);
}

/** [{ group, tokens: [{ name, light, dark, note }] }] read from site.css. */
export function readTokens() {
  const css = readFileSync(CSS, "utf8");
  const dark = new Map();
  for (const line of block(css, ':root[data-theme="dark"]')) {
    const m = line.match(/^\s*(--z-[\w-]+):\s*([^;]+);/);
    if (m) dark.set(m[1], m[2].trim());
  }
  const groups = [];
  let current = null;
  for (const line of block(css, ":root")) {
    const head = line.match(/^\s*\/\*\s*([^*]+?)\s*\*\/\s*$/);
    if (head && !line.includes("--z-")) {
      const title = head[1].split(/[.(]/)[0].trim();
      current = { group: title, tokens: [] };
      groups.push(current);
      continue;
    }
    const m = line.match(/^\s*(--z-[\w-]+):\s*([^;]+);\s*(?:\/\*\s*(.*?)\s*\*\/)?/);
    if (!m || SKIP.test(m[1]) || !current) continue;
    current.tokens.push({ name: m[1], light: m[2].trim(), dark: dark.get(m[1]) ?? m[2].trim(), note: m[3] ?? "" });
  }
  return groups.filter((g) => g.tokens.length);
}

const css = (v) => (/^\d+ \d+ \d+$/.test(v) ? `rgb(${v})` : v);
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

export function tokensTable() {
  const rows = [];
  for (const g of readTokens()) {
    rows.push(`<tr><th colspan="4" class="tk-group">${esc(g.group)}</th></tr>`);
    for (const t of g.tokens) {
      const same = t.light === t.dark;
      rows.push(
        `<tr><td><code class="code-inline">${t.name}</code>${t.note ? `<div class="tk-note">${esc(t.note)}</div>` : ""}</td>` +
          `<td><span class="tk-swatch" style="background:${css(t.light)}"></span> ${esc(t.light)}</td>` +
          `<td>${same ? '<span class="tk-same">same</span>' : `<span class="tk-swatch" style="background:${css(t.dark)}"></span> ${esc(t.dark)}`}</td>` +
          `<td><span class="tk-swatch tk-live" style="background:${css(`var(${t.name})`)}"></span></td></tr>`,
      );
    }
  }
  return [
    `            <div class="overflow-x-auto"><table class="doc-table tk-table">`,
    `              <thead><tr><th>Token</th><th>Light</th><th>Dark</th><th>Now</th></tr></thead>`,
    `              <tbody>`,
    ...rows.map((r) => `                ${r}`),
    `              </tbody>`,
    `            </table></div>`,
  ].join("\n");
}

export function writeTokensDoc() {
  const html = readFileSync(DOC, "utf8");
  const re = /([ \t]*<!-- tokens:start -->)[\s\S]*?([ \t]*<!-- tokens:end -->)/;
  if (!re.test(html)) throw new Error("tokens:start / tokens:end markers missing from design-themes.html");
  writeFileSync(DOC, html.replace(re, (_, a, b) => `${a}\n${tokensTable()}\n${b}`));
  const n = readTokens().reduce((s, g) => s + g.tokens.length, 0);
  console.log(`site/docs/design-themes.html: ${n} tokens`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) writeTokensDoc();
