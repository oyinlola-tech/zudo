import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { resolveProjectLayout } from "./layout/projectLayout.core.js";

const ARCHITECTURES = ["monolith", "modular-monolith", "microservice"] as const;

type Architecture = (typeof ARCHITECTURES)[number];

/**
 * Detects the backend architecture of the project at `cwd`.
 *
 * Reads the manifest (then the legacy config, then package.json) through the
 * shared layout resolver and falls back to directory heuristics for projects
 * that were not created by the CLI.
 */
export async function detectArchitecture(
  cwd: string,
): Promise<Architecture | null> {
  const recorded = resolveProjectLayout(cwd)?.architecture;

  if (recorded && (ARCHITECTURES as readonly string[]).includes(recorded)) {
    return recorded as Architecture;
  }

  if (existsSync(join(cwd, "pnpm-workspace.yaml"))) {
    const gateway = existsSync(join(cwd, "apps/gateway"));
    if (gateway) return "microservice";
  }

  if (hasModuleDirectories(join(cwd, "src", "modules"))) {
    return "modular-monolith";
  }

  return "monolith";
}

/**
 * Whether `modulesDir` holds a modular-monolith module: a directory with
 * its own `<name>.module.ts`. A plain monolith also has `src/modules/` —
 * `zudojs create` writes the app module there as a flat file — so the
 * directory alone used to make every monolith a "modular monolith".
 */
function hasModuleDirectories(modulesDir: string): boolean {
  if (!existsSync(modulesDir)) return false;
  return readdirSync(modulesDir, { withFileTypes: true }).some(
    (entry) =>
      entry.isDirectory() && existsSync(join(modulesDir, entry.name, `${entry.name}.module.ts`)),
  );
}
