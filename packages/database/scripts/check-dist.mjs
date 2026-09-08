/**
 * Post-build guard: every compiled module must ship a declaration file and
 * every `exports` entry in package.json must resolve. A stale or partially
 * deleted dist directory fails here instead of at the consumer.
 */
import { readdirSync, existsSync, readFileSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, "dist");
const problems = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      walk(path);
    } else if (entry.endsWith(".js") && !entry.endsWith(".map")) {
      const declaration = path.slice(0, -3) + ".d.ts";
      if (!existsSync(declaration)) {
        problems.push(`missing declaration: ${relative(root, declaration)}`);
      }
    }
  }
}

if (!existsSync(dist)) {
  problems.push("dist/ does not exist");
} else {
  walk(dist);
}

const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
for (const [subpath, target] of Object.entries(manifest.exports ?? {})) {
  const entries = typeof target === "string" ? { default: target } : target;
  for (const [condition, file] of Object.entries(entries)) {
    if (!existsSync(join(root, file))) {
      problems.push(`exports["${subpath}"].${condition} → ${file} does not exist`);
    }
  }
}

if (problems.length > 0) {
  console.error("dist check failed:\n  " + problems.join("\n  "));
  process.exit(1);
}
console.log("dist check passed");
