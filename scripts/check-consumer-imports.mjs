/**
 * Verifies that every published entry point actually *imports* in a real
 * consumer install.
 *
 * `check-exports.js` proves each declared path exists in dist. That is a
 * weaker promise: a file can exist and still throw the moment a consumer
 * imports it — a bad specifier, a missing extension, or a peer dependency
 * pulled in as a static value import.
 *
 * `@zudojs/database` shipped exactly that defect. It statically imported
 * `PrismaClient` from the `@prisma/client` peer, so any consumer who had not
 * yet run `prisma generate` got a bare `SyntaxError` just from
 * `import "@zudojs/database"` — including consumers who inject their own
 * client and never need the constructor. Nothing in the repo caught it,
 * because inside the workspace the client is always generated.
 *
 * This check packs every package with `pnpm pack` (which rewrites the
 * `workspace:*` protocol the way publishing does), installs the tarballs
 * into a throwaway project, and imports each declared subpath from inside
 * that project — so resolution is the consumer's, not the workspace's.
 *
 * Run after building: node scripts/check-consumer-imports.mjs
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readdirSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workDir = mkdtempSync(join(tmpdir(), "zudo-consumer-"));
const tarballDir = join(workDir, "tarballs");
const consumerDir = join(workDir, "consumer");

const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

let failed = false;

try {
  mkdirSync(tarballDir, { recursive: true });
  mkdirSync(consumerDir, { recursive: true });

  console.log("Packing every package (pnpm pack rewrites workspace:* like publish does)...");
  run("pnpm", ["-r", "--filter", "./packages/**", "exec",
       "pnpm", "pack", "--pack-destination", tarballDir], repoRoot);

  const tarballs = readdirSync(tarballDir).filter((f) => f.endsWith(".tgz"));
  if (tarballs.length === 0) throw new Error("pnpm pack produced no tarballs.");

  // Map each package name to its tarball. `overrides` forces the rewritten
  // sibling ranges (e.g. "@zudojs/core": "1.0.0") to resolve to the local
  // tarball instead of the registry, where that version does not exist yet.
  const deps = {};
  for (const tarball of tarballs) {
    const manifest = JSON.parse(
      run("tar", ["-xzOf", join(tarballDir, tarball), "package/package.json"]),
    );
    deps[manifest.name] = `file:${join(tarballDir, tarball)}`;
  }

  writeFileSync(join(consumerDir, "package.json"), JSON.stringify(
    { name: "zudo-consumer-check", version: "0.0.0", type: "module", private: true, dependencies: deps },
    null, 2,
  ));
  // pnpm 11 reads overrides from pnpm-workspace.yaml, not package.json.
  writeFileSync(join(consumerDir, "pnpm-workspace.yaml"),
    ["overrides:", ...Object.entries(deps).map(([k, v]) => `  "${k}": "${v}"`)].join("\n") + "\n");
  // The throwaway consumer must not inherit the repo's engine-strict setting.
  writeFileSync(join(consumerDir, ".npmrc"), "engine-strict=false\n");

  console.log(`Installing ${Object.keys(deps).length} packages into a throwaway consumer...`);
  run("pnpm", ["install", "--no-frozen-lockfile", "--ignore-scripts"], consumerDir);

  // The probe runs *inside* the consumer so every specifier resolves through
  // the consumer's node_modules, exactly as it would for a real dependant.
  writeFileSync(join(consumerDir, "probe.mjs"), `
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const names = ${JSON.stringify(Object.keys(deps).sort())};
let ok = 0;
const problems = [];

for (const name of names) {
  const manifestPath = join("node_modules", ...name.split("/"), "package.json");
  if (!existsSync(manifestPath)) {
    problems.push(name + " :: not present in node_modules after install");
    continue;
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  // "./package.json" is a deliberate export, but importing JSON needs an
  // import attribute and proves nothing about the package's code.
  const subpaths = manifest.exports
    ? Object.keys(manifest.exports).filter((k) => k.startsWith(".") && k !== "./package.json")
    : ["."];

  for (const subpath of subpaths) {
    const specifier = subpath === "." ? name : name + "/" + subpath.slice(2);
    try {
      const mod = await import(specifier);
      if (Object.keys(mod).length === 0) problems.push(specifier + " :: imports, but exports nothing");
      else ok++;
    } catch (error) {
      problems.push(specifier + " :: " + (error.code ?? error.name) + ": " + String(error.message).split("\\n")[0]);
    }
  }
}

console.log(JSON.stringify({ ok, problems }));
`);

  console.log("Importing every declared entry point...\n");
  const raw = run("node", ["probe.mjs"], consumerDir);
  const { ok, problems } = JSON.parse(raw.trim().split("\n").pop());

  console.log(`Imported ${ok} entry points from a real install.`);
  if (problems.length > 0) {
    failed = true;
    console.error(`\n❌ ${problems.length} entry point(s) fail for consumers:\n`);
    for (const p of problems) console.error(`   - ${p}`);
  } else {
    console.log("✅ Every declared entry point imports cleanly for a consumer.");
  }
} finally {
  rmSync(workDir, { recursive: true, force: true });
}

process.exit(failed ? 1 : 0);
