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
const BASE = (process.env.SITE_URL || "https://zudojs.vercel.app").replace(
  /\/+$/,
  "",
);
const VERIFICATION = process.env.GOOGLE_SITE_VERIFICATION || "";
const OG_IMAGE = `${BASE}/assets/og-image.png`;
const OLD_ORIGIN = /https?:\/\/(?:www\.)?zudo\.dev((?:\/[A-Za-z0-9._\/-]*)?)/g;

const HOME_TITLE = "ZudoJS — Modular TypeScript Framework for Node.js";
const HOME_DESCRIPTION =
  "ZudoJS (Zudo) is a modular TypeScript framework for Node.js: dependency injection, CQRS, events, HTTP, auth, queues and 39 @zudojs packages. Read the docs and get started.";

const PAGE_FIXES = {
  "docs/packages-types.html": {
    title: "@zudojs/types — Type Guards, Utility Types & Converters",
    description:
      "Documentation for @zudojs/types — shared type guards (isPlainObject, isDate, isEmail), utility types (Maybe, DeepReadonly, Prettify) and type converters for the ZudoJS framework.",
  },
};

const isNoIndex = (rel) => rel === "404.html" || rel.startsWith("error/");

function htmlFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const abs = join(dir, entry.name);
    if (entry.isDirectory())
      return entry.name === "assets" ? [] : htmlFiles(abs);
    return entry.name.endsWith(".html") ? [abs] : [];
  });
}

function pathFor(rel) {
  if (rel === "index.html") return "/";
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
  return [site, software]
    .map(
      (ld) =>
        `  <script type="application/ld+json">${JSON.stringify(ld)}</script>`,
    )
    .join("\n");
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
    if (rel === "index.html") lines.push(homeLd());
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

function lastModified(abs) {
  try {
    const out = execFileSync("git", ["log", "-1", "--format=%cs", "--", abs], {
      encoding: "utf8",
    }).trim();
    return out || new Date().toISOString().slice(0, 10);
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

const pages = htmlFiles(ROOT)
  .sort()
  .map((abs) => ({ abs, ...processPage(abs) }));
const indexable = pages.filter((p) => !p.noindex);

const sitemap = [
  `<?xml version="1.0" encoding="UTF-8"?>`,
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
  ...indexable.map((p) => {
    const priority =
      p.rel === "index.html"
        ? "1.0"
        : p.rel.startsWith("docs/getting-started")
          ? "0.9"
          : "0.7";
    return `  <url><loc>${p.url}</loc><lastmod>${lastModified(p.abs)}</lastmod><priority>${priority}</priority></url>`;
  }),
  `</urlset>`,
  ``,
].join("\n");
writeFileSync(join(ROOT, "sitemap.xml"), sitemap);

writeFileSync(
  join(ROOT, "robots.txt"),
  [
    "User-agent: *",
    "Allow: /",
    "Disallow: /error/",
    "",
    `Sitemap: ${BASE}/sitemap.xml`,
    "",
  ].join("\n"),
);

console.log(
  `site-seo: ${pages.length} pages (${indexable.length} indexable) → ${BASE}`,
);
