#!/usr/bin/env node
/**
 * Pre-publish verification for the Zudojs monorepo.
 *
 * Run before publishing. Checks everything that would produce a broken release
 * but not a failing test — each of these has actually bitten this repo:
 *
 *   - a package whose declared entry point was never emitted
 *     (@zudojs/http@0.1.0 shipped with no dist/index.js at all; every
 *      `import "@zudojs/http"` failed with ERR_MODULE_NOT_FOUND)
 *   - a stale dist, so the published code predates the fixes
 *   - internal dependencies still pointing at an older line
 *   - compiled .js debris inside src/, which shadows .ts under NodeNext
 *   - a scoped package missing publishConfig.access, which npm refuses
 *
 * Exits non-zero if any check fails. Nothing here writes.
 *
 * Usage:
 *   node scripts/prepublish-check.mjs            # verify
 *   node scripts/prepublish-check.mjs --order    # also print publish order
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PKGS = join(ROOT, "packages");
const showOrder = process.argv.includes("--order");

const read = (p) => JSON.parse(readFileSync(p, "utf8"));

/** Newest mtime of files matching `exts` under `root`, or 0. */
function newestMtime(root, exts) {
  if (!existsSync(root)) return 0;
  let newest = 0;
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules") continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (exts.some((e) => entry.name.endsWith(e))) {
        newest = Math.max(newest, statSync(full).mtimeMs);
      }
    }
  };
  walk(root);
  return newest;
}

/** Every .js file directly under a package's src/ — always a mistake. */
function srcDebris(pkgDir) {
  const src = join(pkgDir, "src");
  if (!existsSync(src)) return [];
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules") continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".js") || entry.name.endsWith(".js.map")) {
        found.push(full.slice(pkgDir.length + 1));
      }
    }
  };
  walk(src);
  return found;
}

const packages = new Map();
for (const dir of readdirSync(PKGS)) {
  const manifest = join(PKGS, dir, "package.json");
  if (!existsSync(manifest)) continue;
  const pkg = read(manifest);
  packages.set(pkg.name, { dir: join(PKGS, dir), pkg });
}

const failures = [];
const warnings = [];
const versions = new Set();

for (const [name, { dir, pkg }] of packages) {
  if (pkg.private) continue;
  versions.add(pkg.version);

  // Entry point must actually exist on disk.
  for (const field of ["main", "module", "types"]) {
    const rel = pkg[field];
    if (rel && !existsSync(join(dir, rel))) {
      failures.push(`${name}: ${field} "${rel}" does not exist — run the build`);
    }
  }

  // dist must be newer than src, or the published code predates the fixes.
  const srcTime = newestMtime(join(dir, "src"), [".ts"]);
  const distTime = newestMtime(join(dir, "dist"), [".js", ".d.ts"]);
  if (srcTime > distTime) {
    const hours = ((srcTime - distTime) / 3_600_000).toFixed(1);
    failures.push(`${name}: dist is STALE — src is ${hours}h newer. Rebuild.`);
  }

  // Compiled debris in src/ shadows .ts under NodeNext resolution.
  const debris = srcDebris(dir);
  if (debris.length > 0) {
    failures.push(
      `${name}: ${debris.length} compiled .js file(s) inside src/ — these shadow the .ts sources (e.g. ${debris[0]})`,
    );
  }

  // npm refuses a scoped package without explicit public access.
  if (name.startsWith("@") && pkg.publishConfig?.access !== "public") {
    failures.push(`${name}: missing publishConfig.access "public"`);
  }

  if (!pkg.files) warnings.push(`${name}: no "files" field — publishes everything`);

  // Internal deps must match the version being published.
  for (const field of ["dependencies", "peerDependencies"]) {
    for (const [dep, spec] of Object.entries(pkg[field] ?? {})) {
      if (!packages.has(dep)) continue;
      const target = packages.get(dep).pkg.version;
      if (spec !== target && !spec.startsWith("workspace:")) {
        failures.push(
          `${name}: depends on ${dep}@${spec} but ${dep} is at ${target} — publishing this ships a dependency on an older line`,
        );
      }
      if (spec.startsWith("workspace:")) {
        failures.push(
          `${name}: ${dep} uses "${spec}". pnpm rewrites this at publish; npm does NOT and would publish an uninstallable manifest.`,
        );
      }
    }
  }
}

if (versions.size > 1) {
  warnings.push(`packages span multiple versions: ${[...versions].sort().join(", ")}`);
}

// Topological publish order — a dependency must exist on the registry first.
function publishOrder() {
  const depth = new Map();
  const of = (name, seen = new Set()) => {
    if (depth.has(name)) return depth.get(name);
    if (seen.has(name)) return 0;
    const { pkg } = packages.get(name);
    const deps = [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.peerDependencies ?? {}),
    ].filter((d) => packages.has(d));
    const d = deps.length
      ? 1 + Math.max(...deps.map((x) => of(x, new Set([...seen, name]))))
      : 0;
    depth.set(name, d);
    return d;
  };
  for (const name of packages.keys()) of(name);
  const levels = [];
  for (const [name, d] of depth) (levels[d] ??= []).push(name);
  return levels.map((l) => l.sort());
}

console.log(`Checked ${packages.size} packages.\n`);

if (failures.length) {
  console.log(`FAILURES (${failures.length}):`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  console.log();
}
if (warnings.length) {
  console.log(`WARNINGS (${warnings.length}):`);
  for (const w of warnings) console.log(`  ! ${w}`);
  console.log();
}
if (!failures.length) console.log("All pre-publish checks passed.\n");

if (showOrder) {
  console.log("Publish order (each level depends only on earlier levels):");
  publishOrder().forEach((level, i) => {
    console.log(`\n  Level ${i}:`);
    for (const name of level) console.log(`    ${name}`);
  });
  console.log();
}

process.exit(failures.length ? 1 : 0);
