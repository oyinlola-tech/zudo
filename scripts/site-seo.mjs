#!/usr/bin/env node
/**
 * Rewrites the search-engine metadata of every page in `site/` and
 * regenerates `site/sitemap.xml` and `site/robots.txt`.
 *
 * Idempotent: the tags it owns live between `<!-- seo:start -->` and
 * `<!-- seo:end -->` and are rebuilt on every run.
 *
 *   node scripts/site-seo.mjs
 *   SITE_URL=https://example.com node scripts/site-seo.mjs
 *   GOOGLE_SITE_VERIFICATION=<token> node scripts/site-seo.mjs
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../site/", import.meta.url));
/* ZudoJS Academy structure, for lesson breadcrumbs (Academy › course › lesson). */
const ACADEMY = JSON.parse(readFileSync(fileURLToPath(new URL("../site-src/learn/course.json", import.meta.url)), "utf8"));
const BASE = (process.env.SITE_URL || "https://zudojs.oyinlola.site").replace(
  /\/+$/,
  "",
);
const VERIFICATION = process.env.GOOGLE_SITE_VERIFICATION || "";
const OG_IMAGE = `${BASE}/assets/og-image.png`;
const OLD_ORIGIN =
  /https?:\/\/(?:(?:www\.)?zudo\.dev|zudojs\.vercel\.app)((?:\/[A-Za-z0-9._\/-]*)?)/g;

const HOME_TITLE = "ZudoJS — Modular TypeScript Framework for Node.js";
const HOME_DESCRIPTION =
  "ZudoJS (Zudo) is a modular TypeScript framework for Node.js: dependency injection, CQRS, events, HTTP, auth, queues and 39 @zudojs packages.";

const PAGE_FIXES = {
  "docs/packages-types.html": {
    title: "@zudojs/types — Type Guards, Utility Types & Converters",
    description:
      "@zudojs/types docs: type guards (isPlainObject, isDate, isEmail), utility types (Maybe, DeepReadonly, Prettify) and converters for ZudoJS.",
  },
};

const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "PerplexityBot",
  "Google-Extended",
  "Applebot-Extended",
  "CCBot",
];

const isNoIndex = (rel) => rel === "404.html" || rel.startsWith("error/");

function htmlFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const abs = join(dir, entry.name);
    if (entry.isDirectory())
      return entry.name === "assets" ? [] : htmlFiles(abs);
    const isVerification = /^google[0-9a-f]+\.html$/.test(entry.name);
    return entry.name.endsWith(".html") && !isVerification ? [abs] : [];
  });
}

function pathFor(rel) {
  if (rel === "index.html") return "/";
  if (rel.endsWith("/index.html")) return "/" + rel.slice(0, -"/index.html".length);
  return "/" + rel.replace(/\.html$/, "");
}

function mapOldPath(path) {
  if (!path || path === "/") return "";
  if (path.startsWith("/assets/"))
    return path === "/assets/zudo-og.png" ? "/assets/og-image.png" : path;
  const trimmed = path.replace(/\/+$/, "");
  const flat = trimmed.replace(
    /^\/docs\/(.+)$/,
    (_, rest) => "/docs/" + rest.replace(/\//g, "-"),
  );
  return existsSync(join(ROOT, flat + ".html")) ? flat : trimmed;
}

const escapeAttr = (s) =>
  s.replace(/&(?!amp;|lt;|gt;|quot;|#)/g, "&amp;").replace(/"/g, "&quot;");
const decode = (s) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

function readMeta(head, attr, key) {
  const re = new RegExp(`<meta\\s+${attr}="${key}"\\s+content="([^"]*)"`, "i");
  return head.match(re)?.[1];
}

function brandTitle(title) {
  return title
    .replace(/\|\s*Zudo Framework$/, "| ZudoJS")
    .replace(/—\s*Zudo Framework$/, "— ZudoJS");
}

function homeLd() {
  const site = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "ZudoJS",
    alternateName: ["Zudo", "zudojs", "Zudo JS", "Zudo Framework"],
    url: `${BASE}/`,
  };
  const software = {
    "@context": "https://schema.org",
    "@type": "SoftwareSourceCode",
    name: "ZudoJS",
    alternateName: "Zudo",
    description: HOME_DESCRIPTION,
    url: `${BASE}/`,
    codeRepository: "https://github.com/oyinlola-tech/zudo",
    programmingLanguage: "TypeScript",
    runtimePlatform: "Node.js",
    license: "https://opensource.org/licenses/MIT",
    sameAs: [
      "https://github.com/oyinlola-tech/zudo",
      "https://www.npmjs.com/org/zudojs",
    ],
  };
  // Organization carries `logo`, which is what search engines and link
  // unfurlers read the project's logo from. The file it points at is built by
  // scripts/site-brand.mjs and offered for download on /brand.
  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "ZudoJS",
    alternateName: ["Zudo", "Zudo Framework"],
    url: `${BASE}/`,
    logo: `${BASE}/assets/brand/zudo-mark-1024.png`,
    sameAs: [
      "https://github.com/oyinlola-tech/zudo",
      "https://www.npmjs.com/org/zudojs",
    ],
  };
  return [site, software, organization]
    .map(
      (ld) =>
        `  <script type="application/ld+json">${JSON.stringify(ld)}</script>`,
    )
    .join("\n");
}

/**
 * BreadcrumbList for every page below the home page, so search results show
 * "ZudoJS › Docs › Packages › …" and crawlers see how the pages nest.
 */
function breadcrumbLd(rel, title) {
  const crumbs = [["ZudoJS", `${BASE}/`]];
  if (rel.startsWith("learn/") && rel !== "learn/index.html") {
    crumbs.push(["Academy", `${BASE}/learn`]);
    const slug = rel.slice("learn/".length).replace(/\.html$/, "");
    const c = ACADEMY.courses.find((x) => x.modules.some((m) => m.lessons.includes(slug)));
    if (c) crumbs.push([c.title, `${BASE}/learn/${c.id}`]);
  }
  if (rel.startsWith("docs/")) {
    if (rel !== "docs/getting-started.html")
      crumbs.push(["Docs", `${BASE}/docs/getting-started`]);
    if (rel.startsWith("docs/packages-"))
      crumbs.push(["Packages", `${BASE}/docs/packages`]);
  }
  const name = title.replace(/\s+[|—]\s+ZudoJS$/, "").split(" — ")[0];
  crumbs.push([name, BASE + pathFor(rel)]);
  const ld = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map(([name, item], i) => ({
      "@type": "ListItem",
      position: i + 1,
      name,
      item,
    })),
  };
  return `  <script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>`;
}

function seoBlock({ rel, url, title, description, noindex }) {
  const lines = [`  <!-- seo:start -->`];
  if (noindex) {
    lines.push(`  <meta name="robots" content="noindex, follow">`);
  } else {
    lines.push(
      `  <meta name="robots" content="index, follow, max-image-preview:large">`,
      `  <link rel="canonical" href="${url}">`,
    );
    if (VERIFICATION)
      lines.push(
        `  <meta name="google-site-verification" content="${escapeAttr(VERIFICATION)}">`,
      );
    lines.push(
      `  <meta property="og:site_name" content="ZudoJS">`,
      `  <meta property="og:type" content="${rel === "index.html" ? "website" : "article"}">`,
      `  <meta property="og:title" content="${escapeAttr(title)}">`,
      `  <meta property="og:description" content="${escapeAttr(description)}">`,
      `  <meta property="og:url" content="${url}">`,
      `  <meta property="og:image" content="${OG_IMAGE}">`,
      `  <meta name="twitter:card" content="summary_large_image">`,
      `  <meta name="twitter:title" content="${escapeAttr(title)}">`,
      `  <meta name="twitter:description" content="${escapeAttr(description)}">`,
      `  <meta name="twitter:image" content="${OG_IMAGE}">`,
    );
    lines.push(rel === "index.html" ? homeLd() : breadcrumbLd(rel, title));
  }
  lines.push(`  <!-- seo:end -->`);
  return lines.join("\n");
}

const OWNED_TAG =
  /^[ \t]*<(?:link\s+rel="canonical"|meta\s+(?:property="og:[^"]*"|name="twitter:[^"]*"|name="robots"|name="google-site-verification"))[^>]*>[ \t]*\r?\n/gim;
const OWNED_COMMENT =
  /^[ \t]*<!--\s*(?:Open Graph|Twitter Card)\s*-->[ \t]*\r?\n/gim;
const OLD_BLOCK =
  /^[ \t]*<!-- seo:start -->[\s\S]*?<!-- seo:end -->[ \t]*\r?\n/m;

function processPage(abs) {
  const rel = relative(ROOT, abs).split("\\").join("/");
  let html = readFileSync(abs, "utf8");
  const headEnd = html.indexOf("</head>");
  let head = html.slice(0, headEnd);
  const body = html.slice(headEnd);

  head = head
    .replace(OLD_BLOCK, "")
    .replace(OWNED_TAG, "")
    .replace(OWNED_COMMENT, "");
  head = head.replace(/\n{3,}/g, "\n\n");

  const fix = PAGE_FIXES[rel] ?? {};
  const isHome = rel === "index.html";
  const title =
    fix.title ??
    (isHome
      ? HOME_TITLE
      : brandTitle(decode(head.match(/<title>([^<]*)<\/title>/)[1])));
  const description =
    fix.description ??
    (isHome
      ? HOME_DESCRIPTION
      : decode(readMeta(head, "name", "description") ?? ""));
  head = head.replace(
    /<title>[^<]*<\/title>/,
    `<title>${escapeAttr(title)}</title>`,
  );
  if (readMeta(head, "name", "description") !== undefined) {
    head = head.replace(
      /(<meta\s+name="description"\s+content=")[^"]*"/i,
      `$1${escapeAttr(description)}"`,
    );
  } else {
    head = head.replace(
      /(<\/title>\r?\n)/,
      `$1  <meta name="description" content="${escapeAttr(description)}">\n`,
    );
  }

  const url = BASE + (pathFor(rel) === "/" ? "/" : pathFor(rel));
  const block = seoBlock({
    rel,
    url,
    title,
    description,
    noindex: isNoIndex(rel),
  });
  head = head.replace(
    /(<meta\s+name="description"[^>]*>\r?\n)/i,
    `$1${block}\n`,
  );
  head = head.replace(OLD_ORIGIN, (_, path) => BASE + mapOldPath(path));

  writeFileSync(abs, head + body);
  return { rel, url, noindex: isNoIndex(rel) };
}

const previousLastmod = new Map(
  existsSync(join(ROOT, "sitemap.xml"))
    ? [
        ...readFileSync(join(ROOT, "sitemap.xml"), "utf8").matchAll(
          /<loc>([^<]+)<\/loc><lastmod>([^<]+)<\/lastmod>/g,
        ),
      ].map((m) => [m[1], m[2]])
    : [],
);

function lastModified(abs, url) {
  const fallback =
    previousLastmod.get(url) ?? new Date().toISOString().slice(0, 10);
  try {
    const dirty = execFileSync("git", ["status", "--porcelain", "--", abs], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (dirty) return new Date().toISOString().slice(0, 10);
    const out = execFileSync("git", ["log", "-1", "--format=%cs", "--", abs], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return out || fallback;
  } catch {
    return fallback;
  }
}

const pages = htmlFiles(ROOT)
  .sort()
  .map((abs) => ({ abs, ...processPage(abs) }));
const indexable = pages.filter((p) => !p.noindex);

/**
 * Image entries for /brand, so the logo files are crawlable in their own right
 * and not only as decoration on a page. Read from the brand manifest that
 * scripts/site-brand.mjs writes, so the two cannot drift.
 */
function brandImages() {
  const manifestPath = join(ROOT, "assets", "brand", "brand.json");
  if (!existsSync(manifestPath)) return [];
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  return manifest.assets.map((a) => {
    // The SVG is the canonical file; a PNG is offered where a crawler needs one.
    const raster = a.raster[a.raster.length - 1];
    return `    <image:image><image:loc>${escapeAttr(
      raster ? raster.url : a.preferred.url,
    )}</image:loc><image:title>ZudoJS — ${escapeAttr(
      a.name,
    )}</image:title><image:caption>${escapeAttr(a.description)}</image:caption></image:image>`;
  });
}

const IMAGE_NS = ' xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"';

const sitemap = [
  `<?xml version="1.0" encoding="UTF-8"?>`,
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${IMAGE_NS}>`,
  ...indexable.map((p) => {
    const priority =
      p.rel === "index.html"
        ? "1.0"
        : p.rel.startsWith("docs/getting-started")
          ? "0.9"
          : "0.7";
    const head = `  <url><loc>${p.url}</loc><lastmod>${lastModified(p.abs, p.url)}</lastmod><priority>${priority}</priority>`;
    const images = p.rel === "brand.html" ? brandImages() : [];
    return images.length
      ? [head, ...images, `  </url>`].join("\n")
      : `${head}</url>`;
  }),
  `</urlset>`,
  ``,
].join("\n");
writeFileSync(join(ROOT, "sitemap.xml"), sitemap);

writeFileSync(
  join(ROOT, "robots.txt"),
  [
    "# AI agents and LLM crawlers are welcome. Plain-Markdown docs:",
    `#   ${BASE}/llms.txt       (index)`,
    `#   ${BASE}/llms-full.txt  (every page in one file)`,
    `#   ${BASE}/assets/brand/brand.json  (logo files, colours, usage rules)`,
    "",
    "User-agent: *",
    "Allow: /",
    "Disallow: /error/",
    "",
    ...AI_CRAWLERS.flatMap((bot) => [`User-agent: ${bot}`, "Allow: /", ""]),
    `Sitemap: ${BASE}/sitemap.xml`,
    "",
  ].join("\n"),
);

/**
 * Crawl headers for files that are not HTML pages, written into both
 * vercel.json files (the Vercel project deploys from site/, so site/vercel.json
 * is the one that takes effect). Vercel reads vercel.json before the build
 * runs, so this has to happen here and be committed, not at deploy time.
 *
 * - Each Markdown mirror (/docs/x.md, /brand.md) carries
 *   `Link: <page>; rel="canonical"`, which consolidates it into its HTML page
 *   instead of competing with it as a duplicate.
 * - llms.txt, llms-full.txt and the build files served from site/ are
 *   `noindex`: agents still read them, search results never show them.
 */
const NOINDEX_FILES = [
  "/llms.txt",
  "/llms-full.txt",
  "/README.md",
  "/serve.mjs",
  "/tailwind.config.cjs",
  "/vercel.json",
];
const isGeneratedHeader = (h) =>
  h.headers.some(
    (x) =>
      (x.key === "Link" && x.value.includes('rel="canonical"')) ||
      (x.key === "X-Robots-Tag" && NOINDEX_FILES.includes(h.source)),
  );

function crawlHeaders() {
  const mirrors = indexable
    .filter((p) => p.rel !== "index.html")
    .map((p) => ({
      source: "/" + p.rel.replace(/\.html$/, ".md"),
      headers: [{ key: "Link", value: `<${p.url}>; rel="canonical"` }],
    }));
  const noindex = NOINDEX_FILES.map((source) => ({
    source,
    headers: [{ key: "X-Robots-Tag", value: "noindex" }],
  }));
  return [...mirrors, ...noindex];
}

for (const file of [join(ROOT, "vercel.json"), join(ROOT, "..", "vercel.json")]) {
  if (!existsSync(file)) continue;
  const config = JSON.parse(readFileSync(file, "utf8"));
  config.headers = [
    ...(config.headers ?? []).filter((h) => !isGeneratedHeader(h)),
    ...crawlHeaders(),
  ];
  writeFileSync(file, JSON.stringify(config, null, 2) + "\n");
}

console.log(
  `site-seo: ${pages.length} pages (${indexable.length} indexable) → ${BASE}`,
);
