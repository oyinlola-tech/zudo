/**
 * Repository hygiene checks used by architect-check.js.
 *
 * 1. checkWorkflowInjection: GitHub Actions substitutes `${{ … }}` into a
 *    `run:` script as text before bash parses it, so an attacker-controlled
 *    field (PR title/body, branch name, issue text, commit message) templated
 *    there is a script injection. Such fields must reach the script through
 *    `env:` and be read as "$VAR". This fails on any untrusted context found
 *    inside a `run:` block.
 * 2. collectSizeViolations: the AGENTS.md size rules (no source file over
 *    150 lines, no folder over 5 files excluding index.ts). Reported as
 *    warnings unless `--strict-sizes` is passed, because existing code still
 *    breaches them and is being split in a later phase.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

/** Contexts an outside contributor can control. */
const UNTRUSTED = [/github\.event\./, /github\.head_ref/, /inputs\./];

const EXPRESSION = /\$\{\{([^}]*)\}\}/g;

/**
 * Finds untrusted `${{ }}` expressions inside `run:` blocks.
 *
 * @param {string} workflowsDir - Directory holding workflow YAML files.
 * @returns {string[]} One message per offending line.
 */
export function checkWorkflowInjection(workflowsDir) {
  if (!existsSync(workflowsDir)) return [];
  const errors = [];
  for (const file of readdirSync(workflowsDir)) {
    if (!/\.ya?ml$/.test(file)) continue;
    const lines = readFileSync(join(workflowsDir, file), "utf-8").split("\n");
    let runIndent = -1;
    lines.forEach((line, index) => {
      const indent = line.length - line.trimStart().length;
      if (runIndent >= 0 && line.trim() !== "" && indent <= runIndent) {
        runIndent = -1;
      }
      const runMatch = /^(\s*)(- )?run:/.exec(line);
      if (runMatch) {
        runIndent = runMatch[1].length + (runMatch[2] ? 2 : 0);
      } else if (runIndent < 0) {
        return;
      }
      for (const match of line.matchAll(EXPRESSION)) {
        if (UNTRUSTED.some((pattern) => pattern.test(match[1]))) {
          errors.push(
            `${file}:${index + 1} templates "${match[0]}" into a run: script; pass it through env: and read "$VAR"`,
          );
        }
      }
    });
  }
  return errors;
}

/** Recursively lists source directories under `dir`. */
function* walk(dir) {
  yield dir;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) yield* walk(join(dir, entry.name));
  }
}

/**
 * Lists AGENTS.md size-rule breaches in every package's `src/`.
 *
 * @param {string} packagesDir - The monorepo `packages/` directory.
 * @param {string} rootDir - Repo root, for relative paths in messages.
 * @returns {string[]} One message per oversized file or folder.
 */
export function collectSizeViolations(packagesDir, rootDir) {
  const violations = [];
  for (const pkg of readdirSync(packagesDir)) {
    const src = join(packagesDir, pkg, "src");
    if (!existsSync(src)) continue;
    for (const dir of walk(src)) {
      const files = readdirSync(dir, { withFileTypes: true }).filter(
        (entry) => entry.isFile() && /\.tsx?$/.test(entry.name),
      );
      const counted = files.filter((entry) => entry.name !== "index.ts");
      if (counted.length > 5) {
        violations.push(
          `${relative(rootDir, dir)}/ has ${counted.length} files (max 5)`,
        );
      }
      for (const file of files) {
        const path = join(dir, file.name);
        const lineCount = readFileSync(path, "utf-8").split("\n").length;
        if (lineCount > 150) {
          violations.push(
            `${relative(rootDir, path)} has ${lineCount} lines (max 150)`,
          );
        }
      }
    }
  }
  return violations;
}

/**
 * Published packages install-all.sh must not install. `zudojs` is the
 * global-install alias for `zudojs-cli` (`npm install -g zudojs`); the script
 * already installs zudojs-cli, and adding both would give a project two
 * packages that claim the same `zudojs` and `zudo` binaries.
 */
const INSTALL_SCRIPT_EXEMPT = new Set(["zudojs"]);

/**
 * Checks that install-all.sh names exactly the non-private packages in
 * `packages/`. The script once installed `@zudojs/cli`, which was never
 * published (the CLI is `zudojs-cli`), and aborted under `set -e`.
 *
 * @param {string} scriptPath - Path to install-all.sh.
 * @param {ReadonlyArray<{ name: string, private?: boolean }>} packages - Workspace packages.
 * @returns {string[]} One message per missing or unknown name.
 */
export function checkInstallScript(scriptPath, packages) {
  if (!existsSync(scriptPath)) return [];
  const listed = new Set(
    [
      ...readFileSync(scriptPath, "utf-8").matchAll(
        /^\s*"((?:@zudojs\/)?[a-z0-9-]+)"\s*$/gm,
      ),
    ].map((match) => match[1]),
  );
  const published = new Set(
    packages
      .filter((pkg) => !pkg.private && !INSTALL_SCRIPT_EXEMPT.has(pkg.name))
      .map((pkg) => pkg.name),
  );
  const errors = [];
  for (const name of published) {
    if (!listed.has(name))
      errors.push(`install-all.sh does not install ${name}`);
  }
  for (const name of listed) {
    if (!published.has(name))
      errors.push(
        `install-all.sh installs ${name}, which is not a workspace package`,
      );
  }
  return errors;
}
