#!/usr/bin/env node
/**
 * Publishes the docs in forms AI agents and LLMs read well:
 *
 *   site/docs/<page>.md   Markdown mirror of every docs page
 *   site/llms.txt         index in the llmstxt.org format
 *   site/llms-full.txt    every docs page in one Markdown file
 *
 * It also adds `<link rel="alternate" type="text/markdown">` to each docs
 * page so crawlers can find the Markdown copy. Run after editing docs:
 *
 *   node scripts/site-llms.mjs
 *   SITE_URL=https://example.com node scripts/site-llms.mjs
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../site/", import.meta.url));
const DOCS = join(ROOT, "docs");
const BASE = (process.env.SITE_URL || "https://zudojs.oyinlola.site").replace(
  /\/+$/,
  "",
);

/* ---------- HTML parsing ---------- */

const VOID = new Set([
  "br",
  "hr",
  "img",
  "input",
  "meta",
  "link",
  "source",
  "wbr",
]);
const SKIP = new Set([
  "script",
  "style",
  "svg",
  "button",
  "nav",
  "aside",
  "form",
  "noscript",
]);
const TOKEN =
  /<!--[\s\S]*?-->|<\/([a-zA-Z0-9]+)\s*>|<([a-zA-Z0-9]+)((?:\s+[^\s=>\/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*\/?>|[^<]+|</g;
const ATTR = /([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;

function parse(html) {
  const root = { tag: "#root", attrs: {}, children: [] };
  const stack = [root];
  for (const m of html.matchAll(TOKEN)) {
    const top = stack[stack.length - 1];
    if (m[0].startsWith("<!--")) continue;
    if (m[1]) {
      const tag = m[1].toLowerCase();
      const at = stack.findLastIndex((n) => n.tag === tag);
      if (at > 0) stack.length = at;
    } else if (m[2]) {
      const node = { tag: m[2].toLowerCase(), attrs: {}, children: [] };
      for (const a of (m[3] || "").matchAll(ATTR))
        node.attrs[a[1].toLowerCase()] = a[2] ?? a[3] ?? a[4] ?? "";
      top.children.push(node);
      if (!VOID.has(node.tag)) stack.push(node);
    } else top.children.push(m[0]);
  }
  return root;
}

const ENTITIES = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  sbquo: "‚",
  bdquo: "„",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  rarr: "→",
  larr: "←",
  uarr: "↑",
  darr: "↓",
  harr: "↔",
  rArr: "⇒",
  ge: "≥",
  le: "≤",
  ne: "≠",
  times: "×",
  divide: "÷",
  minus: "−",
  plusmn: "±",
  middot: "·",
  bull: "•",
  deg: "°",
  copy: "©",
  reg: "®",
  trade: "™",
  sect: "§",
  para: "¶",
  laquo: "«",
  raquo: "»",
  check: "✓",
};

// One pass, so a decoded "&" can never start a second entity ("&amp;lt;" stays "&lt;").
function decode(s) {
  return s.replace(
    /&(?:#x([0-9a-f]+)|#(\d+)|([a-z][a-z0-9]*));/gi,
    (match, hex, dec, name) => {
      const code = hex ? parseInt(hex, 16) : dec ? Number(dec) : undefined;
      if (code !== undefined) {
        return code <= 0x10ffff ? String.fromCodePoint(code) : match;
      }
      return Object.hasOwn(ENTITIES, name) ? ENTITIES[name] : match;
    },
  );
}

const cls = (n) => ` ${n.attrs?.class ?? ""} `;
const hasClass = (n, c) => cls(n).includes(` ${c} `);
const find = (n, pred) => {
  if (typeof n === "string") return null;
  if (pred(n)) return n;
  for (const c of n.children) {
    const hit = find(c, pred);
    if (hit) return hit;
  }
  return null;
};
const rawText = (n) =>
  typeof n === "string" ? decode(n) : n.children.map(rawText).join("");

/* ---------- Markdown rendering ---------- */

function link(href) {
  if (!href || href.startsWith("#") || /^[a-z]+:/i.test(href)) return href;
  const [path, hash] = href.split("#");
  const slug = path.replace(/\.html$/, "").replace(/\/$/, "");
  const mirrored =
    slug.startsWith("/docs/") ||
    TOP_PAGES.some((f) => f.replace(/\.html$/, "") === slug.slice(1));
  const md =
    mirrored && existsSync(join(ROOT, slug + ".html")) ? slug + ".md" : slug || "/";
  return BASE + md + (hash ? "#" + hash : "");
}

function isBreadcrumb(n) {
  return (
    n.tag === "div" &&
    n.children.some(
      (c) =>
        typeof c !== "string" && c.tag === "span" && rawText(c).trim() === "/",
    )
  );
}

function table(n) {
  const rows = [];
  (function walk(x) {
    if (typeof x === "string") return;
    if (x.tag === "tr")
      rows.push(
        x.children
          .filter((c) => c.tag === "th" || c.tag === "td")
          .map((c) => inline(c).replace(/\|/g, "\\|").trim()),
      );
    else x.children.forEach(walk);
  })(n);
  if (!rows.length) return "";
  const width = Math.max(...rows.map((r) => r.length));
  const pad = (r) => [...r, ...Array(width - r.length).fill("")];
  const out = [
    pad(rows[0]),
    Array(width).fill("---"),
    ...rows.slice(1).map(pad),
  ];
  return "\n\n" + out.map((r) => `| ${r.join(" | ")} |`).join("\n") + "\n\n";
}

function codeBlock(n, codes) {
  const text = rawText(n).replace(/^\n+|\s+$/g, "");
  const lang = /^\$ /m.test(text)
    ? "bash"
    : /^\s*[{[]/.test(text) && !/\bconst\b/.test(text)
      ? "json"
      : "ts";
  codes.push("```" + lang + "\n" + text + "\n```");
  return `\n\n\u0000${codes.length - 1}\u0000\n\n`;
}

function inline(n) {
  return render(n, { codes: [], depth: 0 }).replace(/\s+/g, " ");
}

function render(n, ctx) {
  if (typeof n === "string") return decode(n).replace(/\s+/g, " ");
  if (SKIP.has(n.tag) || n.attrs["aria-hidden"] === "true" || isBreadcrumb(n))
    return "";
  const kids = () => n.children.map((c) => render(c, ctx)).join("");
  const t = n.tag;
  if (/^h[1-6]$/.test(t))
    return `\n\n${"#".repeat(Number(t[1]))} ${kids().trim()}\n\n`;
  if (t === "pre" || hasClass(n, "code-block")) return codeBlock(n, ctx.codes);
  if (t === "code") return "`" + rawText(n).replace(/`/g, "\\`") + "`";
  if (t === "strong" || t === "b") return `**${kids().trim()}**`;
  if (t === "em" || t === "i") return `*${kids().trim()}*`;
  if (t === "a") return `[${kids().trim()}](${link(n.attrs.href)})`;
  if (t === "br") return "\n";
  if (t === "hr") return "\n\n---\n\n";
  if (t === "table") return table(n);
  if (t === "ul" || t === "ol") {
    const items = n.children.filter((c) => c.tag === "li");
    const lines = items.map((li, i) => {
      const body = render(li, { ...ctx, depth: ctx.depth + 1 })
        .trim()
        .replace(/^[→•▸-]\s*/, "");
      const bullet = t === "ol" ? `${i + 1}.` : "-";
      return (
        "  ".repeat(ctx.depth) +
        bullet +
        " " +
        body.replace(/\n+/g, "\n" + "  ".repeat(ctx.depth + 1))
      );
    });
    return "\n\n" + lines.join("\n") + "\n\n";
  }
  if (hasClass(n, "callout")) {
    const body = kids()
      .trim()
      .replace(/\n{2,}/g, "\n\n");
    return (
      "\n\n" +
      body
        .split("\n")
        .map((l) => "> " + l)
        .join("\n") +
      "\n\n"
    );
  }
  if (t === "summary") return `\n\n**${kids().trim()}**\n\n`;
  if (
    [
      "p",
      "div",
      "section",
      "article",
      "details",
      "header",
      "footer",
      "main",
      "li",
      "blockquote",
      "figure",
    ].includes(t)
  ) {
    return `\n\n${kids()}\n\n`;
  }
  return kids();
}

function toMarkdown(mainNode) {
  const ctx = { codes: [], depth: 0 };
  let md = render(mainNode, ctx);
  md = md
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/g, "").replace(/^ (?=\S)/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return md.replace(/\u0000(\d+)\u0000/g, (_, i) => ctx.codes[Number(i)]);
}

/* ---------- page metadata ---------- */

function meta(html, re) {
  return decode(html.match(re)?.[1] ?? "").trim();
}

function pageInfo(file, dir = DOCS) {
  const html = readFileSync(join(dir, file), "utf8");
  const slug = file.replace(/\.html$/, "");
  const title = meta(html, /<title>([^<]*)<\/title>/).replace(
    /\s+[—|]\s+ZudoJS$/,
    "",
  );
  const description = meta(
    html,
    /<meta\s+name="description"\s+content="([^"]*)"/i,
  );
  const main = find(parse(html), (n) => n.tag === "main");
  return { html, slug, title, description, main };
}

/**
 * Pages outside docs/ that also get a Markdown mirror, because an agent asked
 * about the logo or about sponsoring should not have to parse HTML for it.
 */
const TOP_PAGES = ["brand.html", "sponsors.html"];

const GROUPS = [
  ["Getting started", (s) => s.startsWith("getting-started")],
  ["Concepts", (s) => s.startsWith("concepts")],
  ["Architecture", (s) => s.startsWith("architecture")],
  ["Packages", (s) => s.startsWith("packages")],
  ["Project", (s, p) => p.top],
  ["Optional", () => true],
];

/* ---------- output ---------- */

const SUMMARY =
  "ZudoJS (Zudo) is a modular TypeScript framework for Node.js. It is split into 39 independent @zudojs/* packages (dependency injection, configuration, HTTP, events, messaging, CQRS, auth, permissions, database, cache, queues, observability and more) that share one set of contracts, so an application installs only the packages it uses.";

const FACTS = `Facts an agent needs before writing ZudoJS code:

- Runtime: Node.js 24 or newer. Packages are ESM only, so the consuming project needs \`"type": "module"\`. Written for TypeScript in strict mode.
- Install only the packages you use: \`npm install @zudojs/core @zudojs/http\`. Each package page ends with a complete export index generated from the package source.
- Scaffold a new project: \`npx zudojs-cli create my-app\`.
- Every docs page has a Markdown copy at the same URL with \`.md\` appended (for example [packages-http.md](${BASE}/docs/packages-http.md)). [llms-full.txt](${BASE}/llms-full.txt) is all of them in one file.
- Source code: https://github.com/oyinlola-tech/zudo. npm org: https://www.npmjs.com/org/zudojs.
- Logo and brand assets: [/brand](${BASE}/brand.md) is the page; [brand.json](${BASE}/assets/brand/brand.json) is the same kit as data (every file's URL, format, pixel size and intended background, plus the palette, the usage rules and the licence). The mark is [zudo-mark.svg](${BASE}/assets/zudo-mark.svg); use the \`-dark\` files on dark backgrounds.`;

const LINK_TAG = /\n?[ \t]*<link rel="alternate" type="text\/markdown"[^>]*>/g;

const files = readdirSync(DOCS)
  .filter((f) => f.endsWith(".html"))
  .sort();
const pages = [];

for (const file of files) {
  const info = pageInfo(file);
  if (!info.main) continue;
  const url = `${BASE}/docs/${info.slug}`;
  const body = toMarkdown(info.main);
  const doc = [
    "---",
    `title: ${JSON.stringify(info.title)}`,
    `description: ${JSON.stringify(info.description)}`,
    `source: ${url}`,
    "---",
    "",
    body,
    "",
  ].join("\n");
  writeFileSync(join(DOCS, info.slug + ".md"), doc);
  pages.push({ ...info, url, body });

  const tag = `  <link rel="alternate" type="text/markdown" href="/docs/${info.slug}.md" title="Markdown version">`;
  const html = info.html
    .replace(LINK_TAG, "")
    .replace(/(<\/title>)/, `$1\n${tag}`);
  if (html !== info.html) writeFileSync(join(DOCS, file), html);
}

for (const file of TOP_PAGES) {
  const info = pageInfo(file, ROOT);
  if (!info.main) continue;
  const url = `${BASE}/${info.slug}`;
  const body = toMarkdown(info.main);
  writeFileSync(
    join(ROOT, info.slug + ".md"),
    [
      "---",
      `title: ${JSON.stringify(info.title)}`,
      `description: ${JSON.stringify(info.description)}`,
      `source: ${url}`,
      "---",
      "",
      body,
      "",
    ].join("\n"),
  );
  pages.push({ ...info, url, body, top: true });

  const tag = `  <link rel="alternate" type="text/markdown" href="/${info.slug}.md" title="Markdown version">`;
  const html = info.html
    .replace(LINK_TAG, "")
    .replace(/(<\/title>)/, `$1\n${tag}`);
  if (html !== info.html) writeFileSync(join(ROOT, file), html);
}

const byOrder = (a, b) => {
  const rank = (s) =>
    s === "getting-started" ? 0 : s === "packages" ? 0 : s.split("-").length;
  return rank(a.slug) - rank(b.slug) || a.slug.localeCompare(b.slug);
};
const claimed = new Set();
const sections = GROUPS.map(([name, match]) => {
  const list = pages
    .filter((p) => !claimed.has(p.slug) && match(p.slug, p))
    .sort(byOrder);
  list.forEach((p) => claimed.add(p.slug));
  return [name, list];
}).filter(([, list]) => list.length);

const llms = [
  "# ZudoJS",
  "",
  `> ${SUMMARY}`,
  "",
  FACTS,
  "",
  ...sections.flatMap(([name, list]) => [
    `## ${name}`,
    "",
    ...list.map((p) => `- [${p.title}](${p.url}.md): ${p.description}`),
    "",
  ]),
].join("\n");
writeFileSync(join(ROOT, "llms.txt"), llms);

const full = [
  "# ZudoJS documentation",
  "",
  `> ${SUMMARY}`,
  "",
  FACTS,
  "",
  ...sections.flatMap(([, list]) =>
    list.map(
      (p) =>
        `\n\n<!-- source: ${p.url} -->\n\n${p.body.replace(/^#(?=\s)/m, "#")}`,
    ),
  ),
  "",
].join("\n");
writeFileSync(join(ROOT, "llms-full.txt"), full);

console.log(
  `site-llms: ${pages.length} pages → llms.txt, llms-full.txt, docs/*.md (${BASE})`,
);
