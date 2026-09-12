/**
 * zudojs-cli — pnpm settings for generated projects
 *
 * pnpm 10 stopped running the install scripts of dependencies unless the
 * project lists them, and pnpm 11 turned the resulting notice into a failing
 * `ERR_PNPM_IGNORED_BUILDS`. Every generated project depends on `tsx`
 * (backend) or Vite (frontend), both of which pull in esbuild and its
 * postinstall, so a fresh `pnpm install` exited with code 1 and
 * `pnpm run dev` — which re-verifies the install first — never started.
 *
 * pnpm 10 reads `onlyBuiltDependencies`; pnpm 11 reads `allowBuilds`. Both
 * are written so either version installs cleanly, and both live in
 * `pnpm-workspace.yaml`, the file pnpm itself creates for this purpose.
 *
 * @module templates/shared/pnpm
 */

/** Dependencies whose install scripts a generated project allows. */
export const PNPM_ALLOWED_BUILD_SCRIPTS = [
  "esbuild",
  "@swc/core",
  "sharp",
  "@parcel/watcher",
  "@tailwindcss/oxide",
  "unrs-resolver",
] as const;

/**
 * Renders `pnpm-workspace.yaml`.
 *
 * `packages` is omitted for a single-package project: pnpm then treats the
 * directory as the sole workspace member, which is what it already does
 * when it writes the file itself.
 */
export function renderPnpmWorkspaceFile(
  packages: readonly string[] = [],
): string {
  const lines: string[] = [];

  if (packages.length > 0) {
    lines.push("packages:");
    for (const glob of packages) {
      lines.push(`  - ${JSON.stringify(glob)}`);
    }
    lines.push("");
  }

  lines.push("# Dependencies allowed to run install scripts (pnpm 10).");
  lines.push("onlyBuiltDependencies:");
  for (const name of PNPM_ALLOWED_BUILD_SCRIPTS) {
    // Quoted: a bare leading "@" is a reserved YAML indicator.
    lines.push(`  - ${JSON.stringify(name)}`);
  }
  lines.push("");
  lines.push("# The same list in the form pnpm 11 reads.");
  lines.push("allowBuilds:");
  for (const name of PNPM_ALLOWED_BUILD_SCRIPTS) {
    lines.push(`  ${JSON.stringify(name)}: true`);
  }
  lines.push("");

  return lines.join("\n");
}
