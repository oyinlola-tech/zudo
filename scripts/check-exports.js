/**
 * Verifies that every path a package advertises actually exists in its
 * build output.
 *
 * An `exports` map is a promise to consumers, and a subpath that points
 * at a file tsc never emits fails only at import time, in someone else's
 * project, after publish. `@zudojs/runtime` shipped a "./types" subpath
 * for exactly this reason: nothing in the repo imported it, so nothing
 * caught it.
 *
 * Run after building: node scripts/check-exports.js
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packagesDir = join(__dirname, "..", "packages");

const errors = [];
let checked = 0;

for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;

  const pkgDir = join(packagesDir, entry.name);
  const manifestPath = join(pkgDir, "package.json");
  if (!existsSync(manifestPath)) continue;

  const pkg = JSON.parse(readFileSync(manifestPath, "utf-8"));

  const declared = new Set();

  if (pkg.main) declared.add(pkg.main);
  if (pkg.module) declared.add(pkg.module);
  if (pkg.types) declared.add(pkg.types);

  for (const target of Object.values(pkg.exports ?? {})) {
    if (typeof target === "string") {
      declared.add(target);
      continue;
    }
    for (const conditional of Object.values(target ?? {})) {
      if (typeof conditional === "string") declared.add(conditional);
    }
  }

  for (const binPath of Object.values(pkg.bin ?? {})) {
    if (typeof binPath === "string") declared.add(binPath);
  }

  for (const relative of declared) {
    checked++;
    const resolved = join(pkgDir, relative.replace(/^\.\//, ""));
    if (!existsSync(resolved)) {
      errors.push(`${pkg.name}: declares "${relative}", which does not exist`);
    }
  }
}

console.log(`Checked ${checked} declared paths across the workspace.`);

if (errors.length > 0) {
  console.log("\n❌ Unresolvable package entry points:");
  for (const error of errors) console.log(`  - ${error}`);
  console.log("\nBuild the workspace first; if it is built, the map is wrong.");
  process.exit(1);
}

console.log("✅ Every declared entry point, type and bin resolves.");
