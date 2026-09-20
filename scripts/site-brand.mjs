#!/usr/bin/env node
/**
 * Builds the downloadable brand kit under site/assets/brand/:
 *
 *   - PNG exports of every logo SVG, at the sizes people actually paste into
 *     slides, READMEs and app stores. Transparent background, except the app
 *     icon, which carries its own navy tile.
 *   - USAGE.txt, the same rules the /brand page states.
 *   - zudo-brand-kit.zip, every SVG and PNG plus USAGE.txt in one download.
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

const SVGS = [
  "zudo-mark.svg",
  "zudo-mark-dark.svg",
  "zudo-logo.svg",
  "zudo-logo-dark.svg",
  "zudo-logo-icon.svg",
  "zudo-favicon.svg",
];

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

function buildZip() {
  const staging = join(OUT, ".kit");
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(join(staging, "svg"), { recursive: true });
  mkdirSync(join(staging, "png"), { recursive: true });

  for (const svg of SVGS) {
    writeFileSync(join(staging, "svg", svg), readFileSync(join(ASSETS, svg)));
  }
  for (const [, png] of EXPORTS) {
    writeFileSync(join(staging, "png", png), readFileSync(join(OUT, png)));
  }
  writeFileSync(join(staging, "USAGE.txt"), USAGE);

  const zipPath = join(OUT, "zudo-brand-kit.zip");
  rmSync(zipPath, { force: true });
  // -X drops extra file attributes, so the archive is byte-stable between runs.
  execFileSync("zip", ["-r", "-q", "-X", zipPath, "svg", "png", "USAGE.txt"], {
    cwd: staging,
  });
  rmSync(staging, { recursive: true, force: true });
  return zipPath;
}

mkdirSync(OUT, { recursive: true });
const chrome = chromeBinary();
for (const [svg, png, w, h] of EXPORTS) {
  renderPng(chrome, svg, png, w, h);
  console.log(`site-brand: ${png} (${w}x${h})`);
}
rmSync(TMP, { force: true });
writeFileSync(join(OUT, "USAGE.txt"), USAGE);
const zip = buildZip();
console.log(
  `site-brand: ${EXPORTS.length} PNGs, USAGE.txt and ${zip.replace(ROOT + "/", "")}`,
);
