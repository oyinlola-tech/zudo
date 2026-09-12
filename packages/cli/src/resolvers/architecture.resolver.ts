import { existsSync } from "node:fs";
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

  if (existsSync(join(cwd, "src/modules"))) {
    return "modular-monolith";
  }

  return "monolith";
}
