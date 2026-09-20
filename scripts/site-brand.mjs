#!/usr/bin/env node
/**
 * Builds the downloadable brand kit under site/assets/brand/:
 *
 *   - PNG exports of every logo SVG, at the sizes people actually paste into
 *     slides, READMEs and app stores. Transparent background, except the app
 *     icon, which carries its own navy tile.
 *   - USAGE.txt, the same rules the /brand page states.
 *   - brand.json, the whole kit described for machines: every asset URL, its
 *     format and size, the palette, the rules and the licence.
 *   - zudo-brand-kit.zip, all of the above in one download.
 *
 * It also refreshes the schema.org ImageObject list inside site/brand.html,
 * between the `brand-ld` markers.
 *
 * The SVGs in site/assets/ are the source of truth; nothing here edits them.
 * Rendering uses headless Chrome (no npm dependency) and zipping uses the
 * `zip` binary. Both are developer-machine tools: the output is committed, so
 * Vercel never runs this.
 *
 *   node scripts/site-brand.mjs        # or: pnpm site:brand
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS = join(ROOT, "site", "assets");
const OUT = join(ASSETS, "brand");
const TMP = join(OUT, ".render.html");

/** [source SVG, output PNG, width, height] */
const EXPORTS = [
  ["zudo-mark.svg", "zudo-mark-512.png", 512, 512],
  ["zudo-mark.svg", "zudo-mark-1024.png", 1024, 1024],
  ["zudo-mark-dark.svg", "zudo-mark-dark-512.png", 512, 512],
  ["zudo-mark-dark.svg", "zudo-mark-dark-1024.png", 1024, 1024],
  ["zudo-logo.svg", "zudo-logo-660.png", 660, 160],
  ["zudo-logo.svg", "zudo-logo-1320.png", 1320, 320],
  ["zudo-logo-dark.svg", "zudo-logo-dark-660.png", 660, 160],
  ["zudo-logo-dark.svg", "zudo-logo-dark-1320.png", 1320, 320],
  ["zudo-logo-icon.svg", "zudo-app-icon-512.png", 512, 512],
  ["zudo-logo-icon.svg", "zudo-app-icon-1024.png", 1024, 1024],
];

/** [source SVG, id, display name, intended background, description] */
const SVGS = [
  ["zudo-mark.svg", "mark", "Mark", "light", "The Z mark, for light backgrounds."],
  ["zudo-mark-dark.svg", "mark-reversed", "Mark, reversed", "dark", "The Z mark in off-white, for dark backgrounds."],
  ["zudo-logo.svg", "logo", "Logo", "light", "Mark and ZUDO wordmark, for light backgrounds."],
  ["zudo-logo-dark.svg", "logo-reversed", "Logo, reversed", "dark", "Mark and ZUDO wordmark in off-white, for dark backgrounds."],
  ["zudo-logo-icon.svg", "app-icon", "App icon", "any", "The mark on a navy tile, for app icons."],
  ["zudo-favicon.svg", "favicon", "Favicon", "any", "Favicon, drawn on a 32 px grid."],
];

const COLORS = [
  ["Ink", "#1A1A2E", "The mark and wordmark"],
  ["Red", "#C0392B", "The diagonal through the Z"],
  ["Navy", "#16213E", "Dark backgrounds and the app icon tile"],
  ["Off-white", "#FAFAF9", "Light backgrounds and the reversed mark"],
];

const BASE = "https://zudojs.oyinlola.site";

const USAGE = `Zudo brand kit
==============

The Zudo logo, wordmark and app icon, as SVG and PNG.

Files
-----
svg/zudo-mark.svg            The Z mark, for light backgrounds.
svg/zudo-mark-dark.svg       The Z mark, for dark backgrounds.
svg/zudo-logo.svg            Mark + ZUDO wordmark, for light backgrounds.
svg/zudo-logo-dark.svg       Mark + ZUDO wordmark, for dark backgrounds.
svg/zudo-logo-icon.svg       App icon: the mark on a navy tile.
svg/zudo-favicon.svg         Favicon.
png/                         The same artwork at 512/1024 px (marks and icon)
                             and 660/1320 px wide (wordmark lockups).
                             Transparent background, except the app icon.

Prefer the SVG wherever it is supported: it stays sharp at any size.

Colours
-------
Ink     #1A1A2E   the mark and wordmark
Red     #C0392B   the diagonal through the Z
Navy    #16213E   dark backgrounds, app icon tile
Off-white #FAFAF9 light backgrounds, the mark on dark

Using it
--------
- Keep clear space around the logo of at least one module (one square of the
  grid, which is 12/80 of the mark's width).
- Minimum size: 24 px for the mark, 96 px wide for the wordmark lockup.
- Use the dark-background files on dark backgrounds. Do not recolour the
  artwork to make a light version.
- Do not stretch, rotate, add effects to, or rebuild the logo; do not swap the
  red diagonal for another colour; do not set the wordmark in another typeface.
- Use the logo to link to or refer to the Zudo project. Do not use it as your
  own product's logo, or in a way that suggests Zudo endorses your product.

The software is MIT licensed (see the repository). These marks identify the
project; the usage rules above apply to them.

https://zudojs.oyinlola.site/brand
`;

function chromeBinary() {
  const candidates = [
    process.env.CHROME_PATH,
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
  ].filter(Boolean);
  const found = candidates.find((p) => existsSync(p));
  if (!found) {
    throw new Error(
      "No Chrome/Chromium found. Set CHROME_PATH to a Chrome binary and re-run.",
    );
  }
  return found;
}

function renderPng(chrome, svgFile, outFile, width, height) {
  const svg = readFileSync(join(ASSETS, svgFile), "utf8");
  writeFileSync(
    TMP,
    `<!doctype html><meta charset="utf-8">` +
      `<style>html,body{margin:0;padding:0;background:transparent}` +
      `svg{display:block;width:${width}px;height:${height}px}</style>${svg}`,
  );
  execFileSync(
    chrome,
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--hide-scrollbars",
      "--default-background-color=00000000",
      `--window-size=${width},${height}`,
      `--screenshot=${join(OUT, outFile)}`,
      TMP,
    ],
    { stdio: "ignore" },
  );
}

/**
 * brand.json — the same kit, described for machines.
 *
 * An agent asked "what is the Zudo logo and may I use it?" should be able to
 * answer from this one file: every asset with its absolute URL, format, pixel
 * size and intended background, plus the palette, the rules and the licence.
 */
function buildManifest() {
  const assets = [];

  for (const [file, id, name, background, description] of SVGS) {
    const pngs = EXPORTS.filter(([src]) => src === file).map(([, png, w, h]) => ({
      url: `${BASE}/assets/brand/${png}`,
      format: "image/png",
      width: w,
      height: h,
      bytes: readFileSync(join(OUT, png)).length,
    }));
    assets.push({
      id,
      name,
      description,
      background,
      transparent: file !== "zudo-logo-icon.svg",
      preferred: {
        url: `${BASE}/assets/${file}`,
        format: "image/svg+xml",
        bytes: readFileSync(join(ASSETS, file)).length,
      },
      raster: pngs,
    });
  }
  return {
    name: "ZudoJS",
    alternateName: ["Zudo", "Zudo Framework"],
    description:
      "Brand assets for ZudoJS, a modular TypeScript framework for Node.js.",
    page: `${BASE}/brand`,
    markdown: `${BASE}/brand.md`,
    kit: `${BASE}/assets/brand/zudo-brand-kit.zip`,
    updated: new Date().toISOString().slice(0, 10),
    assets,
    colors: COLORS.map(([name, hex, use]) => ({ name, hex, use })),
    rules: {
      clearSpace:
        "At least one module (one square of the grid, 12/80 of the mark's width) on every side.",
      minimumSize: { mark: "24px", lockup: "96px wide" },
      prefer: "SVG wherever it is supported.",
      allowed: [
        "Use the logo to link to or refer to the Zudo project.",
        "Use the reversed files on dark backgrounds.",
      ],
      notAllowed: [
        "Recolouring the artwork or changing the red diagonal.",
        "Stretching, rotating, outlining or adding effects.",
        "Rebuilding the wordmark in another typeface.",
        "Using it as your own product's logo, or to imply endorsement.",
      ],
    },
    license: {
      software: "MIT",
      softwareUrl: "https://github.com/oyinlola-tech/zudo/blob/main/LICENSE",
      marks:
        "The marks identify the project. Use them under the rules above; they are not covered by the MIT grant.",
    },
  };
}

function buildZip() {
  const staging = join(OUT, ".kit");
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(join(staging, "svg"), { recursive: true });
  mkdirSync(join(staging, "png"), { recursive: true });

  for (const [svg] of SVGS) {
    writeFileSync(join(staging, "svg", svg), readFileSync(join(ASSETS, svg)));
  }
  for (const [, png] of EXPORTS) {
    writeFileSync(join(staging, "png", png), readFileSync(join(OUT, png)));
  }
  writeFileSync(join(staging, "USAGE.txt"), USAGE);
  writeFileSync(join(staging, "brand.json"), readFileSync(join(OUT, "brand.json")));

  const zipPath = join(OUT, "zudo-brand-kit.zip");
  rmSync(zipPath, { force: true });
  // -X drops extra file attributes, so the archive is byte-stable between runs.
  execFileSync("zip", ["-r", "-q", "-X", zipPath, "svg", "png", "USAGE.txt", "brand.json"], {
    cwd: staging,
  });
  rmSync(staging, { recursive: true, force: true });
  return zipPath;
}

/**
 * The /brand page states its assets twice: once for people, once as
 * schema.org ImageObjects for crawlers and agents. The second copy is written
 * from the manifest between the brand-ld markers, so it cannot drift.
 */
function writePageLd(manifest) {
  const page = join(ROOT, "site", "brand.html");
  const html = readFileSync(page, "utf8");
  const ld = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "ZudoJS brand assets",
    itemListElement: manifest.assets.map((a, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "ImageObject",
        name: `ZudoJS — ${a.name}`,
        description: a.description,
        contentUrl: a.preferred.url,
        encodingFormat: a.preferred.format,
        thumbnailUrl: a.raster.length ? a.raster[0].url : a.preferred.url,
        ...(a.raster.length
          ? { width: a.raster.at(-1).width, height: a.raster.at(-1).height }
          : {}),
        acquireLicensePage: manifest.page,
        license: manifest.license.softwareUrl,
        creditText: "ZudoJS",
      },
    })),
  };
  const block =
    `  <!-- brand-ld:start -->\n` +
    `  <script type="application/ld+json">${JSON.stringify(ld)}</script>\n` +
    `  <!-- brand-ld:end -->`;
  const markers = /[ \t]*<!-- brand-ld:start -->[\s\S]*?<!-- brand-ld:end -->/;
  if (!markers.test(html)) {
    throw new Error("brand.html is missing the brand-ld markers");
  }
  const next = html.replace(markers, block);
  if (next !== html) writeFileSync(page, next);
}

mkdirSync(OUT, { recursive: true });
const chrome = chromeBinary();
for (const [svg, png, w, h] of EXPORTS) {
  renderPng(chrome, svg, png, w, h);
  console.log(`site-brand: ${png} (${w}x${h})`);
}
rmSync(TMP, { force: true });
writeFileSync(join(OUT, "USAGE.txt"), USAGE);
const manifest = buildManifest();
writeFileSync(join(OUT, "brand.json"), JSON.stringify(manifest, null, 2) + "\n");
writePageLd(manifest);
const zip = buildZip();
console.log(
  `site-brand: ${EXPORTS.length} PNGs, USAGE.txt, brand.json and ${zip.replace(ROOT + "/", "")}`,
);
