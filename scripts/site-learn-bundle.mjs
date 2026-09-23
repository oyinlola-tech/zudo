#!/usr/bin/env node
/**
 * Builds the Zudo packages that the Learn terminal can run in a browser.
 *
 *   pnpm site:learn:bundle
 *
 * Output: site/learn/lib/<package>.js (ESM, with shared chunks) plus
 * site/learn/lib/manifest.json, which the playground reads to resolve
 * `import { … } from "@zudojs/<package>"`. The bundles come from each
 * package's built `dist/`, so run the package builds first. The output is
 * committed, because Vercel never runs this script.
 *
 * Only packages whose sole Node dependency is the random half of
 * `node:crypto` are included; that module is swapped for a Web Crypto
 * shim (scripts/learn/node-shims/crypto.js). Packages that need an HTTP
 * server, AsyncLocalStorage or real hashing stay "run it on your computer".
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "site", "learn", "lib");

export const BROWSER_PACKAGES = [
  "errors",
  "constants",
  "types",
  "schema",
  "validation",
  "container",
  "events",
  "cache",
  "permissions",
  "config",
  "logger",
  "messaging",
  "cqrs",
  "queue",
  "serialization",
  "feature-flags",
];

function loadEsbuild() {
  const store = join(ROOT, "node_modules", ".pnpm");
  const candidates = readdirSync(store)
    .filter((d) => /^esbuild@\d/.test(d))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  if (!candidates.length) throw new Error("esbuild is not installed under node_modules/.pnpm");
  const require = createRequire(join(store, candidates[0], "node_modules", "esbuild", "package.json"));
  return require("esbuild");
}

const shimPlugin = {
  name: "zudo-node-shims",
  setup(build) {
    build.onResolve({ filter: /^(node:)?crypto$/ }, () => ({
      path: join(ROOT, "scripts", "learn", "node-shims", "crypto.js"),
    }));
    build.onResolve({ filter: /^@zudojs\// }, (args) => {
      const name = args.path.slice("@zudojs/".length);
      return { path: join(ROOT, "packages", name, "dist", "index.js") };
    });
  },
};

async function main() {
  const esbuild = loadEsbuild();
  const entryPoints = {};
  const manifest = { generatedBy: "scripts/site-learn-bundle.mjs", packages: {} };

  for (const name of BROWSER_PACKAGES) {
    const entry = join(ROOT, "packages", name, "dist", "index.js");
    if (!existsSync(entry)) throw new Error(`@zudojs/${name} has no dist/index.js; build it first`);
    const version = JSON.parse(readFileSync(join(ROOT, "packages", name, "package.json"), "utf8")).version;
    entryPoints[name] = entry;
    manifest.packages["@zudojs/" + name] = { version, file: name + ".js" };
  }

  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  const result = await esbuild.build({
    entryPoints,
    outdir: OUT,
    bundle: true,
    splitting: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    minify: true,
    keepNames: true,
    chunkNames: "chunks/[name]-[hash]",
    plugins: [shimPlugin],
    banner: { js: "/* @zudojs browser build for the Learn terminal. MIT licensed. */" },
    logLevel: "warning",
    metafile: true,
  });

  writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

  const outputs = Object.entries(result.metafile.outputs);
  const total = outputs.reduce((sum, [, o]) => sum + o.bytes, 0);
  console.log(`site/learn/lib: ${BROWSER_PACKAGES.length} packages, ${outputs.length} files, ${(total / 1024).toFixed(0)} KB`);
}

await main();
