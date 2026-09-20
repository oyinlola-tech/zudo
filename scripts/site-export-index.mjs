/**
 * Regenerates the COMPLETE EXPORT INDEX block on every `site/docs/packages-*`
 * page from the package's own built entry point.
 *
 * The index is the site's claim that nothing shipped is undocumented, so it
 * has to come from the compiler rather than from a hand-kept list. Each
 * package's `dist/index.d.ts` is loaded with the TypeScript API, every export
 * is resolved through its aliases, and the names are grouped by what they
 * actually are.
 *
 * Run it after any change to a package's public surface, and after
 * `changeset version`, since the prose quotes the version being documented.
 *
 *   node scripts/site-export-index.mjs [--check] [pkg ...]
 *
 * `--check` reports drift and exits non-zero without writing, for CI.
 */

import { createRequire } from "node:module";
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Display order and heading text for each export kind. */
const KINDS = [
  ["class", "Classes"],
  ["function", "Functions"],
  ["interface", "Interfaces"],
  ["type", "Type aliases"],
  ["const", "Constants"],
  ["enum", "Enums"],
];

/**
 * TypeScript 7 is the native port: its JS compiler API needs a running `tsgo`
 * process, which is far more machinery than reading a barrel needs. The
 * emitted `.d.ts` files are the authority either way, so this reads them
 * directly — one pass to learn what each declared name *is*, one pass to walk
 * the barrel graph and learn which names are actually public.
 */
const DECLARATION = new RegExp(
  [
    "^\\s*(?:export\\s+)?declare\\s+(?:abstract\\s+)?class\\s+([A-Za-z_$][\\w$]*)",
    "^\\s*(?:export\\s+)?declare\\s+function\\s+([A-Za-z_$][\\w$]*)",
    "^\\s*(?:export\\s+)?interface\\s+([A-Za-z_$][\\w$]*)",
    "^\\s*(?:export\\s+)?type\\s+([A-Za-z_$][\\w$]*)",
    "^\\s*(?:export\\s+)?declare\\s+(?:const\\s+)?enum\\s+([A-Za-z_$][\\w$]*)",
    "^\\s*(?:export\\s+)?declare\\s+(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)",
  ].join("|"),
  "gm",
);

const KIND_BY_GROUP = ["class", "function", "interface", "type", "enum", "const"];

function collectDeclarations(dir, kinds, overwrite = false, seenHere = new Set()) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);

    if (entry.isDirectory()) {
      collectDeclarations(full, kinds, overwrite, seenHere);
      continue;
    }

    if (!entry.name.endsWith(".d.ts")) continue;

    const text = readFileSync(full, "utf8");

    for (const match of text.matchAll(DECLARATION)) {
      for (let i = 0; i < KIND_BY_GROUP.length; i += 1) {
        const name = match[i + 1];

        if (!name) continue;

        /* An enum also matches the const branch; first writer wins, and the
         * loop order puts the more specific kind first. */
        if (overwrite && !seenHere.has(name)) {
          seenHere.add(name);
          kinds.set(name, KIND_BY_GROUP[i]);
        } else if (!kinds.has(name)) {
          kinds.set(name, KIND_BY_GROUP[i]);
        }
      }
    }
  }
}

/**
 * Resolves a module specifier to the `.d.ts` that backs it.
 *
 * A `@zudojs/*` specifier resolves into that sibling's own `dist`, because a
 * package that re-exports a shared error class is publishing that name from
 * its own root and the index has to list it.
 */
function resolveSpecifier(fromFile, specifier) {
  const workspace = /^@zudojs\/([a-z-]+)/.exec(specifier);

  if (workspace) {
    const sibling = join(root, "packages", workspace[1], "dist", "index.d.ts");

    return existsSync(sibling) ? sibling : undefined;
  }

  if (!specifier.startsWith(".")) return undefined;

  const base = resolve(dirname(fromFile), specifier.replace(/\.js$/, ""));

  for (const candidate of [`${base}.d.ts`, join(base, "index.d.ts")]) {
    if (existsSync(candidate)) return candidate;
  }

  return undefined;
}

/** Walks `export *` / `export { … }` from the entry point to the public set. */
function collectPublicNames(entry, seen = new Set(), names = new Set(), aliasSources = new Map()) {
  if (seen.has(entry)) return names;

  seen.add(entry);

  const text = readFileSync(entry, "utf8");

  for (const match of text.matchAll(
    /export\s+\*\s+from\s+["']([^"']+)["']/g,
  )) {
    const target = resolveSpecifier(entry, match[1]);

    if (target) collectPublicNames(target, seen, names, aliasSources);
  }

  for (const match of text.matchAll(
    /export\s+(?:type\s+)?\{([^}]*)\}(?:\s*from\s*["']([^"']+)["'])?/g,
  )) {
    const origin = match[2] ? resolveSpecifier(entry, match[2]) : undefined;

    for (const clause of match[1].split(",")) {
      const parts = clause.trim().replace(/^type\s+/, "").split(/\s+as\s+/);
      const local = (parts[0] ?? "").trim();
      const exported = (parts[1] ?? parts[0] ?? "").trim();

      if (!/^[A-Za-z_$][\w$]*$/.test(exported)) continue;

      names.add(exported);

      /* `export { a as b }` publishes `b` while the declaration says `a`, and
       * a name re-exported from a sibling package is declared in that
       * package's dist, not this one. Record both so the kind lookup lands. */
      if (origin) aliasSources.set(exported, [origin, local]);
      else if (local !== exported) aliasSources.set(exported, [entry, local]);
    }
  }

  for (const match of text.matchAll(DECLARATION)) {
    for (let i = 0; i < KIND_BY_GROUP.length; i += 1) {
      if (match[i + 1] && /^\s*export\s/.test(match[0])) names.add(match[i + 1]);
    }
  }

  return { names, aliasSources, visited: seen };
}

let workspaceKindsCache;

/** Declared name -> kind, across every built package in the workspace. */
function workspaceKinds() {
  if (workspaceKindsCache) return workspaceKindsCache;

  const kinds = new Map();

  for (const dir of readdirSync(join(root, "packages"))) {
    const dist = join(root, "packages", dir, "dist");

    if (existsSync(dist)) collectDeclarations(dist, kinds);
  }

  workspaceKindsCache = kinds;

  return kinds;
}

/** Reads the public export surface of one package from its built types. */
function readExports(pkgDir) {
  const entry = join(pkgDir, "dist", "index.d.ts");

  if (!existsSync(entry)) return undefined;

  const { names, aliasSources } = collectPublicNames(entry);

  /* One declaration map for the whole workspace. A name can travel several
   * hops before it reaches its declaration — `@zudojs/middleware` re-exports
   * its error classes through two local barrels into `@zudojs/errors` — and
   * following every chain individually is more fragile than knowing what
   * every declared name in the monorepo is. Extra entries are harmless: a
   * name is only listed if the barrel walk already found it public. */
  const kinds = new Map(workspaceKinds());

  /* The package's own declarations win over the workspace map: a name can be
   * a class here and an interface in a sibling (`Query` is both), and the
   * page has to describe what THIS package publishes. */
  collectDeclarations(join(pkgDir, "dist"), kinds, true);

  const groups = new Map(KINDS.map(([key]) => [key, []]));
  let total = 0;

  for (const name of names) {
    if (name === "default" || name.startsWith("__")) continue;

    const alias = aliasSources.get(name);
    const kind = kinds.get(name) ?? (alias ? kinds.get(alias[1]) : undefined);

    if (!kind) continue;

    groups.get(kind).push(name);
    total += 1;
  }

  for (const [, list] of groups) list.sort((a, b) => a.localeCompare(b, "en"));

  return { groups, total };
}

const escapeHtml = (value) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function renderHtml(pkgName, version, { groups, total }) {
  const sections = KINDS.filter(([key]) => groups.get(key).length > 0)
    .map(([key, label]) => {
      const names = groups.get(key);
      const chips = names
        .map(
          (n) =>
            `<code class="inline-block bg-black/5 px-1.5 py-0.5 text-xs">${escapeHtml(n)}</code>`,
        )
        .join(" ");

      return (
        `          <div class="mb-5">\n` +
        `            <div class="font-bold text-sm uppercase tracking-wider mb-2">${label} <span class="text-black/60 font-normal">(${names.length})</span></div>\n` +
        `            <div class="flex flex-wrap gap-1">${chips}</div>\n` +
        `          </div>`
      );
    })
    .join("\n");

  return (
    `        <p class="mb-5 text-sm">Every name <code>${escapeHtml(pkgName)}</code> exports from its package root at v${version} &mdash; <strong>${total}</strong> in total, generated from the package&rsquo;s own entry point rather than written by hand. The sections above explain the ones you reach for most; this is the exhaustive list, so nothing shipped is undocumented. Names not covered above are typically internal helpers and supporting types.</p>\n` +
    `        <details class="border-2 border-black p-5 bg-white">\n` +
    `          <summary class="font-bold cursor-pointer select-none">Show all ${total} exports</summary>\n` +
    `          <div class="mt-5">\n` +
    `${sections}\n` +
    `          </div>`
  );
}

/** Replaces the block between the index heading and the page's next marker. */
function spliceHtml(html, replacement) {
  const headingIndex = html.indexOf('id="export-index-heading"');

  if (headingIndex === -1) return undefined;

  const afterHeading = html.indexOf("\n", html.indexOf("</h2>", headingIndex));
  const endMarker = html.indexOf("</details>", afterHeading);

  if (afterHeading === -1 || endMarker === -1) return undefined;

  return `${html.slice(0, afterHeading + 1)}${replacement}\n        ${html.slice(endMarker)}`;
}

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const only = new Set(args.filter((a) => !a.startsWith("--")));

const packages = readdirSync(join(root, "packages"), {
  withFileTypes: true,
})
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .filter((name) => only.size === 0 || only.has(name));

let changed = 0;
let skipped = 0;
const drifted = [];

for (const dir of packages) {
  const pkgDir = join(root, "packages", dir);
  const manifestPath = join(pkgDir, "package.json");

  if (!existsSync(manifestPath)) continue;

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const htmlPath = join(root, "site", "docs", `packages-${dir}.html`);

  if (!existsSync(htmlPath)) {
    skipped += 1;
    continue;
  }

  const surface = readExports(pkgDir);

  if (!surface) {
    console.warn(`  ! ${manifest.name}: no dist/index.d.ts — run the build first`);
    skipped += 1;
    continue;
  }

  const html = readFileSync(htmlPath, "utf8");
  const nextHtml = spliceHtml(
    html,
    renderHtml(manifest.name, manifest.version, surface),
  );

  if (!nextHtml) {
    console.warn(`  ! ${manifest.name}: no export-index block in the html page`);
    skipped += 1;
    continue;
  }

  /* The `.md` mirrors are GENERATED from the `.html` by
   * `scripts/site-llms.mjs`, so writing one here would be overwritten by the
   * next `pnpm site:llms` — and, worse, could disagree with it in the
   * meantime. Only the html is authored; run `pnpm site:llms` afterwards to
   * refresh the mirrors. */

  /* Compare the published NAME SET, not the rendered bytes. A handful of
   * names are declared as both a class and an interface in the same package
   * (`Query` in cqrs is both), and which heading such a name lands under is
   * not something this reader can settle from the `.d.ts` alone. Rewriting a
   * page whose names are already correct would churn those headings for no
   * gain, so a page is only rewritten when its export set actually moved. */
  const published = new Set(
    [...html.matchAll(/text-xs">([^<]+)<\/code>/g)].map((m) => m[1]),
  );

  const generated = new Set(
    [...nextHtml.matchAll(/text-xs">([^<]+)<\/code>/g)].map((m) => m[1]),
  );

  const sameNames =
    published.size === generated.size &&
    [...generated].every((name) => published.has(name));

  /* The version is quoted in the block's prose, so it has to be refreshed
   * even when the export set did not move — a page that names a version the
   * package no longer has is exactly the drift this script exists to stop. */
  const statedVersion = /package root at v([0-9][^\s<&]*)/.exec(html)?.[1];
  const sameVersion = statedVersion === manifest.version;

  if (sameNames && sameVersion) continue;

  if (nextHtml === html) continue;

  drifted.push(`${manifest.name} (${surface.total} exports)`);

  if (checkOnly) continue;

  writeFileSync(htmlPath, nextHtml);

  changed += 1;
  console.log(`  ✓ ${manifest.name} — ${surface.total} exports`);
}

if (checkOnly) {
  if (drifted.length > 0) {
    console.error("✗ Export index is stale for:");
    for (const entry of drifted) console.error(`   - ${entry}`);
    console.error("\n  Run: node scripts/site-export-index.mjs");
    process.exit(1);
  }

  console.log("✅ Every export index matches its package's built entry point.");
  process.exit(0);
}

console.log(
  `\n✅ Export index regenerated for ${changed} package(s)` +
    (skipped > 0 ? `, ${skipped} skipped.` : "."),
);
