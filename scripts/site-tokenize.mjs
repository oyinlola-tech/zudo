#!/usr/bin/env node
/**
 * Replaces literal colours in the site's page stylesheets with the theme
 * tokens from css/site.css, keyed by the role the colour plays (background,
 * text, border, shadow). The light value of every token is the literal it
 * replaces, so light mode does not move by a pixel; the dark block in site.css
 * gives the same tokens their dark values.
 *
 *   node scripts/site-tokenize.mjs           rewrite in place, report counts
 *   node scripts/site-tokenize.mjs --check   exit 1 if any literal remains
 *
 * Colours that are the same in both themes are listed in INVARIANT and left
 * alone: the Catppuccin code palette, the VS Code editor palette, accents that
 * only ever sit on the always-dark hero and footer. ide.css and playground.css
 * are fixed dark panels and are not touched. Anything else that is not in the
 * table is an error, so a new literal cannot slip in unnoticed.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SITE = fileURLToPath(new URL("../site/css/", import.meta.url));
const FILES = ["docs.css", "learn.css", "home.css", "errors.css", "packages.css", "brand.css", "site.css"];
const CHECK = process.argv.includes("--check");

const INVARIANT = new Set([
  // Catppuccin Mocha (code panels, terminal, search overlay)
  "#1E1E2E", "#181825", "#11111B", "#313244", "#45475A", "#585B70", "#6C7086", "#7F849C", "#9399B2",
  "#A6ADC8", "#BAC2DE", "#CDD6F4", "#A6E3A1", "#F5C2E7", "#89B4FA", "#F9E2AF", "#F38BA8", "#94E2D5",
  "#CBA6F7", "#FAB387", "#89DCEB", "#B4BEFE", "#F5E0DC", "#C7F0C3", "#0B0B12", "#2E2E4D", "#E6E9EF",
  "#F9C6CF", "#4FC1FF", "#F4D03F",
  // VS Code-styled "open in editor" button
  "#1E1E1E", "#333333",
  // accents that only appear on the always-dark hero and footer
  "#E6675A", "#5DA9E9", "#52BE80",
  // the navy app-icon tile (brand)
  "#16213E",
  // mask gradients and dark-hero overlays
  "#000", "RGBA(255,255,255,0.03)", "RGBA(192,57,43,0.22)", "RGBA(230,103,90,0.55)", "RGBA(93,169,233,0.55)",
  "RGBA(137,180,250,0.3)", "RGBA(0,0,0,0.35)",
]);

const V = (name) => `var(--z-${name})`;
const RGB = (name, a) => `rgb(var(--z-${name}) / ${a})`;

/* role → { literal → replacement }. Literals are upper-case hex, or rgba with spaces removed. */
const MAP = {
  bg: {
    "#FAFAF9": V("bg"), "#FFFFFF": V("surface"), "#FFF": V("surface"), "#F5F5F0": V("surface-alt"),
    "#F9FAFB": V("gray-50"), "#EEF0F3": V("code-inline-bg"), "#ECECEA": V("stage"), "#1A1A2E": V("inverse"),
    "#C0392B": V("red"), "#A93226": V("red-hover"), "#2471A3": V("blue"), "#1E8449": V("green"), "#D4AC0D": V("yellow"),
    "#EFF6FF": V("tint-blue"), "#E8F0FB": V("tint-blue-2"), "#EAF2F8": V("tint-blue-3"), "#EEF4FB": V("tint-blue-4"),
    "#FDF2F2": V("tint-red-2"), "#FEF3F2": V("tint-red-3"), "#FDECEA": V("tint-red-4"),
    "#F0FFF4": V("tint-green-2"), "#E8F6EE": V("tint-green-3"), "#F0FAF3": V("tint-green-4"),
    "#FEF9E7": V("tint-yellow-2"), "#FFFBEA": V("tint-yellow-3"), "#F3EBFA": V("tint-purple"),
    "RGBA(36,113,163,0.08)": RGB("blue-rgb", 0.08), "RGBA(0,0,0,0.03)": RGB("black-rgb", 0.03),
    "RGBA(26,26,46,0.95)": RGB("scrim-rgb", 0.95), "RGBA(26,26,46,0.92)": RGB("scrim-rgb", 0.92), "RGBA(26,26,46,0.5)": RGB("scrim-rgb", 0.5),
    "RGBA(250,250,249,0)": RGB("bg-rgb", 0),
  },
  text: {
    "#1A1A2E": V("text"), "#111827": V("gray-900"), "#1F2937": V("gray-800"), "#374151": V("gray-700"),
    "#4B5563": V("gray-600"), "#6B7280": V("gray-500"), "#9CA3AF": V("gray-400"), "#D1D5DB": V("gray-300"),
    "#FFFFFF": V("on-accent"), "#FFF": V("on-accent"), "#FAFAF9": V("paper"),
    "#C0392B": V("red-text"), "#2471A3": V("blue-text"), "#1E8449": V("green-text"), "#7D6608": V("yellow-dark"),
    "#6B5705": V("yellow-ink"), "#5D4E0B": V("yellow-ink-2"), "#14683A": V("green-deep"), "#B91C1C": V("red-700"),
    "#1B4F9C": V("blue-deep"), "#1A5276": V("blue-deep-2"), "#6B2FA0": V("purple"), "#7F8C8D": V("text-muted-2"),
    "RGBA(26,26,46,0.72)": RGB("ink-rgb", 0.72), "RGBA(26,26,46,0.78)": RGB("ink-rgb", 0.78), "RGBA(26,26,46,0.7)": RGB("ink-rgb", 0.7),
    "RGBA(250,250,249,0.72)": RGB("paper-rgb", 0.72), "RGBA(250,250,249,0.7)": RGB("paper-rgb", 0.7),
    "RGBA(250,250,249,0.78)": RGB("paper-rgb", 0.78), "RGBA(250,250,249,0.62)": RGB("paper-rgb", 0.62),
    "RGBA(250,250,249,0.6)": RGB("paper-rgb", 0.6), "RGBA(250,250,249,0.55)": RGB("paper-rgb", 0.55),
    "RGBA(250,250,249,0.5)": RGB("paper-rgb", 0.5),
  },
  border: {
    "#1A1A2E": V("ink"), "#E5E7EB": V("border"), "#D1D5DB": V("border-strong"), "#9CA3AF": V("gray-400"),
    "#E1E4E8": V("code-inline-border"), "#BDC3C7": V("border-mid"), "#C0392B": V("red-text"), "#2471A3": V("blue-text"),
    "#1E8449": V("green-text"), "#D4AC0D": V("yellow-text"), "#14683A": V("green-deep"), "#1B4F9C": V("blue-deep"),
    "#B91C1C": V("red-700"), "#6B2FA0": V("purple"), "#2E86C1": V("blue-focus"), "#FFFFFF": V("on-accent"), "#FAFAF9": V("paper"),
    "RGBA(26,26,46,0.25)": RGB("ink-rgb", 0.25), "RGBA(26,26,46,0.3)": RGB("ink-rgb", 0.3), "RGBA(26,26,46,0.1)": RGB("ink-rgb", 0.1),
    "RGBA(250,250,249,0.12)": RGB("paper-rgb", 0.12), "RGBA(250,250,249,0.25)": RGB("paper-rgb", 0.25), "RGBA(250,250,249,0.6)": RGB("paper-rgb", 0.6),
  },
  shadow: {
    "#1A1A2E": V("shadow"), "#C0392B": V("red"), "#2471A3": V("blue"),
    "RGBA(26,26,46,0.15)": RGB("ink-rgb", 0.15), "RGBA(26,26,46,0.18)": RGB("ink-rgb", 0.18),
  },
  decoration: { "#C0392B": V("red-text") },
};

function roleOf(prop) {
  const p = prop.trim().toLowerCase();
  if (p === "background" || p === "background-color" || p === "background-image") return "bg";
  if (p === "color") return "text";
  if (p.startsWith("border") || p.startsWith("outline")) return "border";
  if (p.includes("shadow")) return "shadow";
  if (p === "text-decoration-color") return "decoration";
  return null;
}

const LITERAL = /#[0-9A-Fa-f]{3,8}\b|rgba?\((?!var\()[^)]*\)/g;
const norm = (c) => (c.startsWith("#") ? c.toUpperCase() : c.replace(/\s/g, "").toUpperCase());

const problems = [];
let replaced = 0;

for (const name of FILES) {
  const file = SITE + name;
  const src = readFileSync(file, "utf8");
  /* comments are blanked (same length) so a "border:" inside one is not a declaration */
  const masked = src.replace(/\/\*[\s\S]*?\*\//g, (c) => " ".repeat(c.length));
  let out = "";
  let last = 0;
  const decl = /([a-zA-Z-]+)\s*:\s*([^;{}]+)(?=[;}])/g;
  let m;
  while ((m = decl.exec(masked))) {
    const [whole, prop, value] = m;
    const role = roleOf(prop);
    if (prop.startsWith("--") || role === null || !LITERAL.test(value)) {
      LITERAL.lastIndex = 0;
      continue;
    }
    LITERAL.lastIndex = 0;
    const newValue = value.replace(LITERAL, (lit) => {
      const key = norm(lit);
      if (INVARIANT.has(key)) return lit;
      const hit = MAP[role]?.[key];
      if (hit) {
        replaced++;
        return hit;
      }
      const line = src.slice(0, m.index).split("\n").length;
      problems.push(`${name}:${line}  ${prop}: ${lit}`);
      return lit;
    });
    if (newValue !== value) {
      out += src.slice(last, m.index) + whole.replace(value, newValue);
      last = m.index + whole.length;
    }
  }
  out += src.slice(last);
  if (!CHECK && out !== src) writeFileSync(file, out);
}

/* SVG shapes in page markup: a literal fill or stroke that is not themed with a
   style="fill: var(--z-…)" beside it turns invisible against currentColor labels
   in dark. Brand and code-palette colours are allowed as in stylesheets. */
import { readdirSync } from "node:fs";
const MARKUP_DIRS = ["../site-src/learn/", "../site/docs/", "../site/"];
for (const dir of MARKUP_DIRS) {
  const abs = fileURLToPath(new URL(dir, import.meta.url));
  for (const name of readdirSync(abs).filter((f) => f.endsWith(".html"))) {
    const html = readFileSync(abs + name, "utf8");
    for (const m of html.matchAll(/<(rect|path|polygon|ellipse|circle|line)\b([^>]*)>/g)) {
      const attrs = m[2];
      for (const c of attrs.matchAll(/\b(fill|stroke)="(#[0-9A-Fa-f]{3,8})"/g)) {
        if (INVARIANT.has(c[2].toUpperCase()) || ["#C0392B", "#1A1A2E", "#FAFAF9"].includes(c[2].toUpperCase())) continue;
        if (new RegExp(`style="[^"]*${c[1]}:\\s*var\\(--z-`).test(attrs)) continue;
        const line = html.slice(0, m.index).split("\n").length;
        problems.push(`${dir.replace("../", "")}${name}:${line}  <${m[1]} ${c[1]}="${c[2]}"> (add style="${c[1]}: var(--z-…)")`);
      }
    }
  }
}

if (problems.length) {
  console.error(`${problems.length} colour(s) have no token:\n  ` + problems.join("\n  "));
  process.exit(1);
}
console.log(CHECK ? "no unmapped literals" : `replaced ${replaced} literal colour(s) with tokens`);
