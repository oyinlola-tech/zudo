import { resolveProjectLayout } from "../resolvers/layout/projectLayout.core.js";

/**
 * Returns the recorded architecture of the project at `cwd`, or `null` when
 * the directory is not a Zudojs project.
 *
 * Used to read a `zudojs.config.json` that no template has ever written, so
 * it returned `null` for every project. It now reads the same sources as
 * every other command: the manifest, the legacy `zudojs.config.ts`, then
 * the `zudojs` block in `package.json`.
 */
export async function detectArchitecture(cwd: string): Promise<string | null> {
  return resolveProjectLayout(cwd)?.architecture ?? null;
}
